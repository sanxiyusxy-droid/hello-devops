'use strict';

const { buildGreeting, DEFAULT_NAME } = require('../src/greeting');

describe('buildGreeting', () => {
  test('给了名字就用名字', () => {
    expect(buildGreeting('Qoder')).toBe('Hello, Qoder!');
  });

  test('前后空格会被去掉', () => {
    expect(buildGreeting('  Ada  ')).toBe('Hello, Ada!');
  });

  test('空字符串回退到默认名', () => {
    expect(buildGreeting('')).toBe(`Hello, ${DEFAULT_NAME}!`);
  });

  test('undefined 也回退到默认名', () => {
    expect(buildGreeting(undefined)).toBe('Hello, World!');
  });
});
