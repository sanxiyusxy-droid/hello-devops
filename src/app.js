'use strict';

const express = require('express');
const { buildGreeting } = require('./greeting');

// 版本号由构建时注入（见 Dockerfile 的 ARG APP_VERSION）。
// 本地直接 node 启动时没有这个变量，就显示 dev。
const APP_VERSION = process.env.APP_VERSION || 'dev';

function createApp() {
  const app = express();

  // 健康检查端点：容器 HEALTHCHECK 和 CI 冒烟测试都靠它判断服务是否活着。
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: APP_VERSION });
  });

  app.get('/api/greet', (req, res) => {
    res.json({ message: buildGreeting(req.query.name) });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}

module.exports = { createApp, APP_VERSION };
