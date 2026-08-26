# 完整实操教程：从写代码到镜像上线

全程 7 个阶段。**标着 👉 的命令由你在终端执行**，其余是讲解和检查点。
每个阶段末尾有「你应该看到」，对不上就停下来排查，不要往下走。

贯穿全程的一条主线是：**每一步都要有可验证的产出**。写完代码要能跑测试，提交完要能看到历史，推送完要看到流水线变绿，发布完要能把镜像拉下来跑起来。

---

## 阶段 0：装环境

你本机已有 git 2.50 和 Python，但缺 Node 和 Docker。两个都要手动装（你没有 Homebrew）。

### 0.1 装 Node.js 24 LTS

👉 浏览器打开下载安装包（macOS 通用安装包，Apple Silicon 可用）：

```
https://nodejs.org/dist/v24.19.0/node-v24.19.0.pkg
```

双击 `.pkg` 一路下一步，需要输入你的 Mac 密码。

装完**开一个新终端**（旧终端的 PATH 不会更新），验证：

```bash
node -v    # 期望 v24.19.0
npm -v     # 期望 11.x
```

### 0.2 装 Docker Desktop

👉 下载 Apple Silicon 版（约 600MB）：

```
https://desktop.docker.com/mac/main/arm64/Docker.dmg
```

打开 dmg，把 Docker 拖进「应用程序」，然后启动 Docker Desktop。首次启动要授权（输密码），右上角鲸鱼图标不再转圈就算就绪。

验证：

```bash
docker --version
docker run --rm hello-world     # 会拉一个 1KB 的测试镜像并打印一段话
```

> 如果报 `Cannot connect to the Docker daemon`，说明 Docker Desktop 没启动 —— 它是个后台守护进程，`docker` 命令只是客户端，这个区别后面排错常用到。

### 0.2.1 配置镜像加速（国内网络必做）

上面那条命令很可能卡住，最后报：

```
failed to resolve reference "docker.io/library/hello-world:latest":
failed to do request: Head "https://registry-1.docker.io/v2/...": context deadline exceeded
```

这不是你装错了。Docker 默认从 **Docker Hub**（`registry-1.docker.io`）拉镜像，该域名在国内通常不可达。解决办法是给守护进程配一个**镜像加速地址**（registry mirror）。

👉 打开 Docker Desktop → 右上角齿轮 **Settings** → 左侧 **Docker Engine**，在 JSON 里加上 `registry-mirrors` 字段：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run"
  ]
}
```

> 注意不要删掉原有的其他字段，只是新增一项（记得前一项末尾补逗号）。

点 **Apply & restart**，等守护进程重启完，重试：

```bash
docker run --rm hello-world
```

> **你应该看到**：`Hello from Docker!`。

配了镜像源之后，Dockerfile 里照样写 `FROM node:24-alpine` 就行 —— 守护进程会自动改从镜像源拉。**千万不要把加速地址写进 Dockerfile**（写成 `FROM docker.m.daocloud.io/library/node:24-alpine`）：那样镜像就绑死在你的网络环境上，换台机就构建不了。网络差异属于环境配置，不属于项目产物 —— 这是个很重要的边界。

顺便说一下：阶段 4 开始的 CI 跑在 GitHub 的服务器上，那边访问 Docker Hub 无障碍，**不需要任何镜像源配置**。这也是为何不能把加速地址写进 Dockerfile 的原因之一。

### 0.3 确认 GitHub SSH 打通

你 `~/.ssh` 下已有 `id_ed25519`，先确认这把钥匙 GitHub 认不认：

```bash
ssh -T git@github.com
```

- 看到 `Hi <你的用户名>! You've successfully authenticated` → 通了，跳到阶段 1。
- 看到 `Permission denied (publickey)` → 公钥还没加到 GitHub。执行 `cat ~/.ssh/id_ed25519.pub` 复制输出，粘到 https://github.com/settings/keys 的 New SSH key。

---

## 阶段 1：看懂项目结构

项目已经生成在 `hello-devops/`，先花两分钟理解每个文件为什么存在 —— 这决定了后面流程为什么这么设计。

```
hello-devops/
├── src/
│   ├── greeting.js    纯函数：给名字返回问候语
│   ├── app.js         Express 路由，两个接口
│   └── server.js      启动监听
├── tests/
│   ├── greeting.test.js   单元测试（不启服务，最快）
│   └── app.test.js        接口测试（supertest 内存里发请求，不占端口）
├── package.json       依赖清单 + npm 脚本
├── Dockerfile         怎么把代码打成镜像
├── .dockerignore      哪些文件不进镜像
├── .gitignore         哪些文件不进 git
└── .github/workflows/ci.yml    流水线定义
```

三个设计动机值得留意：

1. **业务逻辑抽成 `greeting.js` 纯函数**。它不依赖 express、不依赖网络，测试起来毫秒级。真实项目里"测试难写"往往是因为逻辑和框架糊在一起。
2. **有 `/health` 健康检查接口**。这不是给用户用的，是给机器用的 —— Docker 的 HEALTHCHECK、CI 的冒烟测试、生产环境的负载均衡，全靠它判断"这个实例还活着吗"。
3. **版本号从环境变量 `APP_VERSION` 读**。构建时注入，这样你 `curl /health` 就能知道当前跑的是哪个版本。阶段 7 会看到 git tag 一路传到运行中的容器里。

---

## 阶段 2：本地开发与测试

👉 进目录装依赖：

```bash
cd /Users/sanxiyu/Documents/Qoder/2026-08-26/chat-1/hello-devops
npm install
```

> **注意 `npm install` 生成的 `package-lock.json`**。它锁死了每个依赖（包括依赖的依赖）的精确版本和哈希。**这个文件必须提交进 git** ——否则 CI 上装出来的依赖版本可能和你本地不一样，出现"我这好使"的经典问题。

👉 跑测试：

```bash
npm test
```

> **你应该看到**：2 个测试文件、8 个测试全部 PASS。

👉 启动服务实际访问一下：

```bash
npm start
```

另开一个终端窗口：

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/api/greet?name=Qoder"
```

> **你应该看到**：`{"status":"ok","version":"dev"}` 和 `{"message":"Hello, Qoder!"}`。
> 注意 version 是 `dev` —— 本地裸跑没有注入版本号。

验证完回到第一个终端按 `Ctrl+C` 停掉服务。

---

## 阶段 3：git 提交

现在代码能跑了，把它变成有历史记录的仓库。

👉 初始化并把主分支命名为 main：

```bash
git init -b main
```

👉 看看 git 眼里现在是什么状态：

```bash
git status
```

> **你应该看到**：一堆 `Untracked files`，而且 **`node_modules/` 不在其中** —— `.gitignore` 生效了。这很关键：`node_modules` 有几万个文件，提交进去会让仓库彻底不可用，依赖应该靠 `package-lock.json` 复现。

👉 暂存所有文件，再看状态：

```bash
git add .
git status
```

> 现在文件都变成 `Changes to be committed`。这就是 **暂存区（staging area）** —— git 比其他版本控制多出来的一层，让你能精确挑选"这次提交要包含哪些改动"，而不是一股脑全提交。

👉 提交：

```bash
git commit -m "feat: 初始化 hello-devops 项目

- Express 服务，提供 /health 和 /api/greet 两个接口
- Jest 单元测试与接口测试
- 两阶段 Dockerfile，非 root 用户运行
- GitHub Actions 流水线：测试 + 构建推送镜像"
```

> **提交信息的写法**：第一行是简短摘要（50 字以内），空一行，然后是详细说明。前缀 `feat:` / `fix:` / `docs:` / `chore:` 是 Conventional Commits 约定，能让工具自动生成变更日志。这个习惯值得从第一天就养成。

👉 看看你的第一条历史：

```bash
git log --stat
```

`--stat` 会显示每个文件增删了多少行。按 `q` 退出。

---

## 阶段 4：推到 GitHub，第一次看见 CI 跑起来

### 4.1 建远端仓库

👉 打开 https://github.com/new，填写：

- **Repository name**：`hello-devops`
- 选 **Public**（免费用 Actions 和 GHCR，额度不受限）
- **不要**勾选 Add a README / .gitignore / license —— 我们本地已经有了，勾了会造成初始提交冲突

点 Create repository。

### 4.2 关联并推送

👉 把 `<你的GitHub用户名>` 换成实际用户名：

```bash
git remote add origin git@github.com:<你的GitHub用户名>/hello-devops.git
git remote -v
git push -u origin main
```

> `-u` 是 `--set-upstream`，把本地 main 和远端 origin/main 绑定。之后你直接 `git push` / `git pull` 就行，不用再写参数。

> **你应该看到**：一段 `Writing objects...` 然后 `branch 'main' set up to track 'origin/main'`。

### 4.3 观察流水线

👉 浏览器打开 `https://github.com/<你的用户名>/hello-devops/actions`

你会看到一个正在运行的 CI，点进去能看到两个 job：

```
单元测试 ──> 构建并推送镜像
```

第二个 job 上写着 `needs: test`，意思是**测试不通过就绝不构建镜像**。这就是 CI 最核心的价值：把"人可能忘记做"的检查变成"机器强制执行"的门禁。

点开 `单元测试` job，逐步展开每一步看日志：拉代码 → 装 Node → `npm ci` → `npm test`。你会发现日志和你本地跑的一模一样 —— CI 没有魔法，它就是一台干净的机器帮你重复执行了你本地的命令。

> **你应该看到**：两个 job 都是绿色对勾，耗时约 1-2 分钟。
> 如果 `构建并推送镜像` 失败并提示权限问题，去仓库 Settings → Actions → General → Workflow permissions，选 **Read and write permissions** 保存，然后回 Actions 页面点 Re-run jobs。

👉 回到仓库首页，右侧 Packages 区域应该出现了 `hello-devops` 镜像包。**你的代码已经变成了一个可分发的产物。**

---

## 阶段 5：特性分支 + PR，体验红灯到绿灯

这是整个教程最有价值的一段。真实团队协作不会直接往 main 推代码，而是走 **分支 → PR → CI 检查 → 评审 → 合并**。

我们要故意提交一个有 bug 的改动，亲眼看 CI 把它拦下来。

### 5.1 开分支

👉

```bash
git switch -c feat/uppercase-greeting
```

> `git switch -c` 创建并切换分支（比老式的 `git checkout -b` 语义更清晰）。分支在 git 里只是一个指向某次提交的轻量指针，创建它几乎零成本，所以"每个改动开一个分支"是完全可行的实践。

### 5.2 改代码（故意引入 bug）

需求假设是：**名字要转成大写**，即 `?name=qoder` 返回 `Hello, QODER!`。

👉 用编辑器打开 `src/greeting.js`，把 `buildGreeting` 函数体改成：

```javascript
function buildGreeting(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const target = trimmed === '' ? DEFAULT_NAME : trimmed;
  return `Hello, ${target.toUpperCase()}!`;
}
```

注意这个改动会**破坏现有测试**：原来的测试期望 `Hello, Qoder!`，现在会返回 `Hello, QODER!`。这模拟了真实场景里最常见的事故 —— 你改了一个函数，却不知道别处依赖了它的旧行为。

👉 先在本地看看差异：

```bash
git diff
```

> `git diff` 显示**工作区 vs 暂存区**的差异，`-` 是删除行，`+` 是新增行。提交前养成 `git diff` 一遍的习惯，能拦住绝大多数手滑。

👉 提交并推送：

```bash
git add src/greeting.js
git commit -m "feat: 问候语中的名字转为大写"
git push -u origin feat/uppercase-greeting
```

### 5.3 开 PR，看 CI 亮红灯

👉 推送成功后终端会给一个链接，形如 `https://github.com/<你的用户名>/hello-devops/pull/new/feat/uppercase-greeting`，打开它，点 **Create pull request**。

PR 页面下方会出现 `单元测试` 检查项，等一分钟。

> **你应该看到**：红色叉号 `Some checks were not successful`。

👉 点 Details 看失败日志，你会看到清楚的失败原因：

```
● buildGreeting › 给了名字就用名字
  expect(received).toBe(expected)
  Expected: "Hello, Qoder!"
  Received: "Hello, QODER!"
```

**停下来体会一下**：这个 bug 没有进入 main，没有进入镜像，没有到用户面前。它在合并前 60 秒就被拦住了，而且日志直接告诉你哪一行断言、期望什么、实际什么。这就是自动化测试 + CI 的全部意义。

### 5.4 修复，看它转绿

需求本身是对的（要大写），是测试的期望需要跟着更新。

👉 打开 `tests/greeting.test.js`，把前三个测试的期望值改成大写：

```javascript
  test('给了名字就用名字', () => {
    expect(buildGreeting('Qoder')).toBe('Hello, QODER!');
  });

  test('前后空格会被去掉', () => {
    expect(buildGreeting('  Ada  ')).toBe('Hello, ADA!');
  });

  test('空字符串回退到默认名', () => {
    expect(buildGreeting('')).toBe(`Hello, ${DEFAULT_NAME.toUpperCase()}!`);
  });

  test('undefined 也回退到默认名', () => {
    expect(buildGreeting(undefined)).toBe('Hello, WORLD!');
  });
```

👉 还有 `tests/app.test.js` 里的接口测试也要改，把两处 `Hello, Qoder!` 和 `Hello, World!` 改成 `Hello, QODER!` 和 `Hello, WORLD!`。

👉 **先在本地验证再推**（这是好习惯：不要把 CI 当成你的调试器，每次推送等一分钟太慢）：

```bash
npm test
```

绿了再推：

```bash
git add tests/
git commit -m "test: 更新测试期望以匹配大写行为"
git push
```

> 这次不用加 `-u`，上一步已经建立了追踪关系。

👉 回到 PR 页面，**不用手动做任何事** —— CI 检测到新提交，自动重新跑了一遍。

> **你应该看到**：绿色对勾 `All checks have passed`。

### 5.5 合并

👉 点 **Merge pull request** → **Confirm merge** → 然后点 **Delete branch**（远端分支合并后就没用了，删掉保持仓库干净）。

👉 回到本地，同步远端状态：

```bash
git switch main
git pull
git log --oneline --graph --all
```

> **你应该看到**：图形化的提交历史，能看到分支从 main 分出去又合回来的轨迹。

👉 顺手删掉本地那个已经合并的分支：

```bash
git branch -d feat/uppercase-greeting
```

👉 再看一眼 Actions 页面：合并到 main 触发了新的一次运行，这次会走完 `构建并推送镜像`，产出一个新的 `:main` 镜像。**代码合并自动带来了新产物 —— 这就是 CD（持续交付）。**

---

## 阶段 6：本地玩透 Docker

前面镜像都是 CI 帮你构建的，现在自己在本地走一遍，理解里面发生了什么。

👉 构建镜像：

```bash
docker build -t hello-devops:local .
```

第一次会拉 `node:24-alpine` 基础镜像，需要等一会儿。观察输出里的分层：每个 `COPY` / `RUN` 都是一层。

👉 **再执行一次同样的命令**：

```bash
docker build -t hello-devops:local .
```

> **你应该看到**：几乎瞬间完成，每一步都标着 `CACHED`。这就是**层缓存**。Dockerfile 里先 `COPY package.json` 再 `npm ci`、最后才 `COPY src`，就是为了让"改业务代码"不触发"重装依赖" —— 只要依赖清单没变，那层缓存就能复用。顺序写反的话，每改一行代码都要重装全部依赖。

👉 看看镜像大小：

```bash
docker images | grep hello-devops
```

约 150MB 左右，其中绝大部分是 Node 运行时本身。alpine 基础镜像 + 两阶段构建（不带 devDependencies）省下了几百 MB。

👉 后台运行容器：

```bash
docker run -d --name hello -p 3000:3000 hello-devops:local
```

- `-d` 后台运行（detached）
- `--name hello` 给容器起名，后面好引用
- `-p 3000:3000` **端口映射**，格式是 `宿主机端口:容器端口`。容器有自己独立的网络命名空间，不映射的话宿主机访问不到

👉 验证：

```bash
curl http://localhost:3000/health
```

👉 常用排查命令，逐个试一遍：

```bash
docker ps                    # 看运行中的容器，注意 STATUS 里的 (healthy)
docker logs hello            # 看容器标准输出，排错第一步永远是看日志
docker exec -it hello sh     # 进容器内部开个 shell
```

进去之后可以看看：

```sh
ls              # 只有 node_modules、package.json、src —— tests 和 .git 都没进来（.dockerignore）
whoami          # node，不是 root
env | grep APP  # APP_VERSION=dev
exit
```

> `docker ps` 的 STATUS 列过一会儿会显示 `(healthy)`，这是 Dockerfile 里 HEALTHCHECK 在起作用 —— 容器自己每 10 秒调一次 `/health`。

👉 试试注入版本号，理解环境变量怎么改变行为：

```bash
docker run --rm -e APP_VERSION=9.9.9-test -p 3001:3000 -d --name hello-test hello-devops:local
curl http://localhost:3001/health
```

> **你应该看到**：`{"status":"ok","version":"9.9.9-test"}`。同一个镜像，不同环境变量，不同行为 —— 这就是"一次构建，多环境部署"的基础。

👉 清理：

```bash
docker rm -f hello hello-test
docker ps -a          # 确认没有残留容器
```

---

## 阶段 7：打 tag 发布，闭环验证

最后一步：模拟一次正式发版，并把产物真正"部署"起来。

### 7.1 打标签并推送

👉

```bash
git tag -a v1.0.0 -m "首个版本：问候接口 + 健康检查"
git push origin v1.0.0
```

> **tag 和 branch 的区别**：branch 会随新提交移动，tag 永久钉在某一次提交上。发版就该用 tag —— 三个月后你要复现 v1.0.0 的行为，`git checkout v1.0.0` 拿到的一定是当时那份代码。
> `-a` 创建附注标签（带作者、日期、说明，可签名），比轻量标签更适合正式发布。

### 7.2 观察发布流水线

👉 打开 Actions 页面，你会看到由 tag 触发的新运行。

看 `计算镜像标签` 那一步的日志，`metadata-action` 从 tag `v1.0.0` 推导出了镜像标签 `1.0.0`，并作为 `APP_VERSION` 传给 `docker build`。

再看最后的 `冒烟测试` 步骤：CI 把刚推上去的镜像真的 `docker run` 起来，`curl /health` 确认它能响应。**构建成功 ≠ 能跑起来**，冒烟测试补上了这个缺口。

> **你应该看到**：全绿，日志里有 `健康检查通过`。

### 7.3 把镜像拉下来跑（这就是"部署"）

👉 GHCR 上的包默认是私有的。先去 `https://github.com/<你的用户名>/hello-devops/pkgs/container/hello-devops` → 右侧 Package settings → 拉到底 Danger Zone → **Change visibility** → 设为 Public。

（这是演示项目所以公开；真实私有项目的做法是用 PAT `docker login ghcr.io`。）

👉 现在，在你本地拉取这个由 CI 构建、你本机从未构建过的镜像：

```bash
docker pull ghcr.io/<你的用户名>/hello-devops:1.0.0
docker run -d --name prod -p 8080:3000 ghcr.io/<你的用户名>/hello-devops:1.0.0
curl http://localhost:8080/health
```

> **你应该看到**：
> ```json
> {"status":"ok","version":"1.0.0"}
> ```

**停下来看清这个 `1.0.0` 从哪来的**：

```
你敲的 git tag v1.0.0
   → GitHub 收到 tag 推送，触发 workflow
      → metadata-action 解析出版本号 1.0.0
         → 作为 build-arg 注入 docker build
            → 写进镜像的 ENV APP_VERSION
               → Node 进程读取 process.env.APP_VERSION
                  → 你现在 curl 看到的这个字符串
```

一条命令，穿透了版本控制、CI、镜像构建、容器运行时四层。这就是完整的 DevOps 流水线。

👉 清理：

```bash
docker rm -f prod
```

---

## 全流程回顾

```
   本地开发              提交                    CI 测试              构建               部署
┌──────────┐      ┌─────────────┐      ┌──────────────┐   ┌────────────┐   ┌──────────────┐
│ 改代码    │      │ git add      │      │ PR 触发       │   │ docker     │   │ docker pull  │
│ npm test  │ ───▶ │ git commit   │ ───▶ │ npm ci        │──▶│ build      │──▶│ docker run   │
│ 本地验证  │      │ git push     │      │ npm test      │   │ push GHCR  │   │ curl /health │
└──────────┘      └─────────────┘      └──────────────┘   └────────────┘   └──────────────┘
     ↑                                        │
     └────────── 红灯就在这里被拦住，改完重推 ──┘
```

四条核心心法：

1. **每一层都要有验证手段**：本地 `npm test`、CI 门禁、镜像 HEALTHCHECK、部署后 `curl /health`。层层设卡，问题才能在最便宜的时候被发现。
2. **一切靠文件描述，不靠人记**：依赖靠 `package-lock.json`、环境靠 `Dockerfile`、流程靠 `ci.yml`。这些文件都在 git 里，所以"环境"和"流程"本身也有了版本历史。
3. **一次构建，多处运行**：同一个镜像通过环境变量适配不同环境，绝不为测试环境和生产环境分别构建。
4. **本地能验证的别丢给 CI**：CI 一轮一分钟，本地 `npm test` 三秒。CI 是安全网，不是调试器。

---

## 命令速查

**git**

```bash
git status                      # 当前状态（用得最多）
git diff                        # 工作区 vs 暂存区
git diff --staged               # 暂存区 vs 上次提交
git add <file> / git add .      # 暂存
git commit -m "msg"             # 提交
git log --oneline --graph --all # 图形化历史
git switch -c <branch>          # 创建并切换分支
git switch main                 # 切回主分支
git pull / git push             # 同步远端
git restore <file>              # 撤销工作区改动（未 add）
git restore --staged <file>     # 取消暂存（已 add，保留改动）
git tag -a v1.0.0 -m "msg"      # 打附注标签
```

**docker**

```bash
docker build -t name:tag .      # 构建
docker images                   # 列镜像
docker run -d -p 8080:3000 img  # 后台运行 + 端口映射
docker ps / docker ps -a        # 运行中 / 全部容器
docker logs -f <name>           # 跟踪日志
docker exec -it <name> sh       # 进容器
docker rm -f <name>             # 强制删容器
docker system prune -a          # 清理所有无用镜像和容器（慎用，会删干净）
```

---

## 排错索引

| 现象 | 原因与处理 |
| --- | --- |
| `command not found: node` | 装完 pkg 没开新终端，PATH 没刷新 |
| `Cannot connect to the Docker daemon` | Docker Desktop 没启动，去应用程序里打开它 |
| `git push` 报 `Permission denied (publickey)` | SSH 公钥没加到 GitHub，见阶段 0.3 |
| CI 里 `npm ci` 报缺少 lockfile | `package-lock.json` 没提交，`git add package-lock.json` |
| CI 推镜像报 `denied: permission_denied` | 仓库 Settings → Actions → Workflow permissions 改成 Read and write |
| `docker pull` 报 `denied` / `unauthorized` | GHCR 包还是私有，见阶段 7.3 改成 Public |
| `curl: (52) Empty reply` | 服务监听了 127.0.0.1 而非 0.0.0.0，容器外访问不到 |
| `docker pull` 报 `context deadline exceeded` | Docker Hub 不可达，配镜像加速，见阶段 0.2.1 |
| 端口被占用 `port is already allocated` | 换宿主机端口，或 `docker rm -f` 掉旧容器 |
