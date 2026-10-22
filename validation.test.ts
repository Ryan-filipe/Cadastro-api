import assert from 'node:assert/strict';
import test from 'node:test';
import { listQuerySchema, objectIdSchema, parsePagination, userInputSchema } from './validation.ts';

test('aceita dados válidos e remove espaços externos', () => {
  const result = userInputSchema.safeParse({ nome: '  Ana  ', email: ' ANA@example.com ', idade: 25 });
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, { nome: 'Ana', email: 'ANA@example.com', idade: 25 });
});

test('rejeita e-mail inválido, idade fracionária e propriedades inesperadas', () => {
  assert.equal(userInputSchema.safeParse({ nome: 'Ana', email: 'invalido', idade: 25 }).success, false);
  assert.equal(userInputSchema.safeParse({ nome: 'Ana', email: 'ana@example.com', idade: 25.5 }).success, false);
  assert.equal(userInputSchema.safeParse({ nome: 'Ana', email: 'ana@example.com', idade: 25, role: 'admin' }).success, false);
});

test('rejeita parâmetros repetidos ou fora do formato esperado', () => {
  assert.equal(listQuerySchema.safeParse({ page: ['1', '2'] }).success, false);
  assert.equal(listQuerySchema.safeParse({ unexpected: 'value' }).success, false);
  assert.deepEqual(parsePagination({}), { page: 1, limit: 100 });
  assert.deepEqual(parsePagination({ page: '2', limit: '25' }), { page: 2, limit: 25 });
  assert.equal(parsePagination({ limit: '101' }), null);
  assert.equal(parsePagination({ page: '0' }), null);
});

test('aceita apenas IDs MongoDB de 24 caracteres hexadecimais', () => {
  assert.equal(objectIdSchema.safeParse('507f1f77bcf86cd799439011').success, true);
  assert.equal(objectIdSchema.safeParse('not-an-id').success, false);
});
