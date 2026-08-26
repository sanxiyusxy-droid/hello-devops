# hello-devops

一个刻意做到最小的 HTTP 服务，用来完整走一遍 **开发 → 提交 → 测试 → 构建 → 部署** 的流程。

代码本身只有三个文件、两个接口，重点全在外围的 git / Docker / CI 上。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回 `{"status":"ok","version":"..."}` |
| GET | `/api/greet?name=Xxx` | 返回 `{"message":"Hello, XXX!"}`（名字转大写），不传 name 则用 `World` |

## 本地开发

```bash
npm install      # 首次：安装依赖并生成 package-lock.json
npm test         # 跑单元测试
npm start        # 启动服务，访问 http://localhost:3000/health
npm run dev      # 改代码自动重启
```

## 容器方式运行

```bash
docker build -t hello-devops:local .
docker run --rm -p 3000:3000 hello-devops:local
```

## 目录结构

```
├── src/
│   ├── greeting.js   纯函数业务逻辑（最好测的一层）
│   ├── app.js        Express 路由
│   └── server.js     启动入口
├── tests/            Jest 单元测试 + 接口测试
├── Dockerfile        两阶段构建，非 root 运行
└── .github/workflows/ci.yml   CI/CD 流水线
```

## 完整实操教程

见 [WALKTHROUGH.md](./WALKTHROUGH.md)：分 7 个阶段，从装环境到镜像发布上线。
