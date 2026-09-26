# GitHub Pages 部署

## 直接上传已构建网站（无需安装开发工具）

1. 在 GitHub 新建仓库，例如 `review-study`。Pages 通常使用公开仓库；网页不包含你的学习记录和密钥。
2. 解压提供的 `review-pages-static.zip`，上传其中所有文件及目录到仓库根目录。必须包含 `.nojekyll`，不要再套一层文件夹。
3. 仓库 Settings → Pages → Build and deployment，选择 Deploy from a branch，分支 `main`、目录 `/ (root)`，保存。
4. 等待 Pages 构建完成，打开其显示的网址。支持项目子目录，无须绑定域名。

## 从源代码自动部署

上传提供的源代码包后，在 Settings → Pages 中选择 GitHub Actions。仓库的 `.github/workflows/pages.yml` 会自动安装依赖、构建并发布。以后更新 main 即自动发布。

本地构建：Node.js 22.13+，运行 `npm ci` 和 `npm run build:pages`。输出目录为 `pages-dist/`。本地预览应通过 HTTP 服务打开，不要直接双击 index.html。

## 静态版与私有完整版

Pages 版支持本地知识与掌握度、全部题型手动导入、已导入的 SAT/ACT/TOEFL 模拟、口语录音与自评、笔记、复习计划、周期表和备份。

GitHub Pages 本身不运行服务器。本站在浏览器中解锁 `public/pages-vault.json` 后，可以直接连接 Cloudflare AI 和 Supabase，实现 AI 练习、登录与私有同步；不解锁也能使用本地学习和手动导入。浏览器识图所需的 Tesseract 核心及中英文模型随构建文件发布，不需要从外部 CDN 下载。

「网站配置口令」是解锁加密配置的独立口令，**不是** Supabase token、Supabase 登录密码或 GitHub 密码。口令只在本机输入；忘记后无法从加密文件还原，必须用原始配置重新加密并发布新的 `pages-vault.json`，随后在所有设备输入新口令。不要把 token 填入口令框。

两个域名的浏览器存储相互独立。迁移时先在旧网站导出个人数据备份，再到新网站的数据中心导入。不要把个人备份、教材、录音、`.env`、令牌或服务器凭据上传到 GitHub。

加密文件主要避免机器人直接检索明文，并不能使浏览器端 token 达到服务器密钥的保密强度。Supabase 数据访问仍须依赖用户登录和行级安全策略；不要在 Pages 配置中放入 `service_role` 密钥。

考试界面使用用户提供的 ExamSimulator Source v0.11.0 网页运行时进行适配。官方外观仅用于学习模拟；成绩不换算官方量表。
