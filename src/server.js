'use strict';

const { createApp, APP_VERSION } = require('./app');

const PORT = Number(process.env.PORT) || 3000;

// 监听 0.0.0.0 而不是 127.0.0.1：容器里只监听回环地址的话，宿主机映射端口后访问不到。
createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`hello-devops listening on http://0.0.0.0:${PORT} (version=${APP_VERSION})`);
});
