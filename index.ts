import 'dotenv/config';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { z } from 'zod';
import { objectIdSchema, parsePagination, userInputSchema } from './validation.ts';

const configSchema = z.object({
  MONGODB_URI: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  HOST: z.string().default('127.0.0.1'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173')
});

const configResult = configSchema.safeParse(process.env);
if (!configResult.success) {
  console.error('Configuração inválida. Verifique MONGODB_URI, PORT, HOST e FRONTEND_ORIGIN no .env.');
  process.exit(1);
}
const config = configResult.data;

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: config.FRONTEND_ORIGIN,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10kb', strict: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensagem: 'Muitas requisições. Tente novamente mais tarde.' }
});
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensagem: 'Limite de alterações atingido. Tente novamente mais tarde.' }
});
app.use(globalLimiter);

const usuarioSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254 },
  idade: { type: Number, required: true, min: 0, max: 150, validate: Number.isInteger }
}, { timestamps: true, strict: 'throw' });

const UsuarioModel = mongoose.model('Usuario', usuarioSchema);

app.get('/usuarios', async (req, res, next) => {
  const pagination = parsePagination(req.query);
  if (!pagination) {
    res.status(400).json({ mensagem: 'Parâmetros de paginação inválidos' });
    return;
  }

  try {
    const usuarios = await UsuarioModel.find()
      .select('nome email idade')
      .sort({ _id: 1 })
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .lean();
    res.json(usuarios);
  } catch (error) {
    next(error);
  }
});

app.post('/usuarios', writeLimiter, async (req, res, next) => {
  const inputResult = userInputSchema.safeParse(req.body);
  if (!inputResult.success) {
    res.status(400).json({ mensagem: 'Dados inválidos. Informe nome, e-mail e idade inteira válida.' });
    return;
  }

  try {
    const novoUsuario = await UsuarioModel.create(inputResult.data);
    res.status(201).json({
      _id: novoUsuario._id,
      nome: novoUsuario.nome,
      email: novoUsuario.email,
      idade: novoUsuario.idade
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res.status(409).json({ mensagem: 'Este e-mail já está cadastrado' });
      return;
    }
    next(error);
  }
});

app.delete('/usuarios/:id', writeLimiter, async (req, res, next) => {
  const idResult = objectIdSchema.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ mensagem: 'ID inválido' });
    return;
  }

  try {
    const usuario = await UsuarioModel.findByIdAndDelete(idResult.data).select('_id').lean();
    if (!usuario) {
      res.status(404).json({ mensagem: 'Usuário não encontrado' });
      return;
    }
    res.status(200).json({ mensagem: 'Usuário excluído com sucesso' });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ mensagem: 'Rota não encontrada' });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : 500;
  if (status === 413) {
    res.status(413).json({ mensagem: 'Corpo da requisição excede o limite permitido' });
    return;
  }
  if (status === 400) {
    res.status(400).json({ mensagem: 'Requisição inválida' });
    return;
  }
  console.error('Erro interno ao processar requisição');
  res.status(500).json({ mensagem: 'Erro interno do servidor' });
};
app.use(errorHandler);

async function iniciarServidor() {
  try {
    await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10 });
    const server = app.listen(config.PORT, config.HOST, () => {
      console.log(`Servidor rodando em ${config.HOST}:${config.PORT}`);
    });
    server.requestTimeout = 15_000;
  } catch {
    console.error('Não foi possível conectar ao MongoDB. Verifique a URI e a rede permitida no Atlas.');
    process.exit(1);
  }
}

void iniciarServidor();
