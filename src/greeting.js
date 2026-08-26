'use strict';

const DEFAULT_NAME = 'World';

/**
 * 生成问候语。
 * 刻意抽成纯函数：不碰网络、不碰框架，是最容易写单元测试的那一层。
 */
function buildGreeting(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const target = trimmed === '' ? DEFAULT_NAME : trimmed;
  return `Hello, ${target}!`;
}

module.exports = { buildGreeting, DEFAULT_NAME };
