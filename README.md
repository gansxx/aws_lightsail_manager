# AWS Lightsail Manager (Android Edition) 🚀

专为 **AWS Lightsail** 打造的 Android 原生风格云实例生命周期与成本优化管理应用。支持**删除前自动快照休眠**、**极速快照唤醒**并自动将全新分配的公网 IP 写入 **Cloudflare DNS** 记录，支持定时自动化与内置 **Floci 仿真模拟器**免扣费演练，并集成专业**故障排查与 API 调试控制台**。

---

## 📱 核心功能特性

1. **暂时删除实例（休眠省钱模式 · 删前必存 Snapshot）**
   - 自动在销毁计算实例前触发 `CreateInstanceSnapshot`，校验快照状态就绪后安全删除 Lightsail 计算资源。
   - 实例计算费率（约 $3.50 ~ $20/月）即刻停止计费（降为 $0），仅保留极低费率的 EBS 快照存储费（$0.05/GB-月）。
2. **从 Snapshot 快速恢复并自动同步 Cloudflare DNS**
   - 一键根据历史快照重建 Lightsail 实例。
   - 实时轮询等待 AWS 分配全新动态公网 IPv4 地址。
   - 自动调用 Cloudflare API（`PUT /zones/:zone_id/dns_records/:id`），无缝将新公网 IP 写入指定的 A 记录，彻底解决重新开机后 IP 变动导致服务断连的问题。
3. **生命周期定时任务调度（Scheduled Automation）**
   - 可针对每个实例灵活配置：夜间定时自动休眠（快照+删除）与早晨定时自动唤醒（恢复+更新 DNS）。
   - 内置任务轮询守护进程（每 30 秒自动巡检）。
   - 提供「立即模拟执行」按钮，无需等待时钟即可随时验证自动化任务。
4. **内置 AWS Floci 仿真测试引擎（免扣费安全测试）**
   - 完整模拟 AWS Lightsail 与 Cloudflare DNS 接口状态机。
   - 动态随机模拟真实 AWS 亚太/北美公网 IP 分配。
   - 支持**故障注入测试**：可主动开启 AWS 429 限流、504 快照超时、Cloudflare 10000 鉴权失败，验证系统的容错与排查能力。
5. **故障排查与调试接口（Debug Console）**
   - **实时 API 日志流**：捕获所有 HTTP 请求的 Method、Endpoint、Payload、状态码与执行耗时（ms）。
   - **一键全链路诊断**：检测 AWS 连通性、Cloudflare Token 有效性、DNS 解析一致性与快照完整性。
   - **诊断报告包导出**：一键生成包含完整日志与运行状态的 JSON 报告。

---

## 🔑 必须配置的密钥与说明

在部署或使用本应用前，请在应用内的「**设置**」界面（或在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions**）中配置以下凭证：

### 1. AWS Lightsail 访问凭证

用于向 AWS 发起实例查询、创建快照、删除实例和从快照恢复计算资源。

| 环境变量 / 配置项 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | AWS IAM 用户的访问密钥 ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM 用户的私有访问密钥 | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_DEFAULT_REGION` | Lightsail 所在默认区域代码 | `ap-northeast-1` (东京) / `us-west-2` (俄勒冈) |

#### 🛡️ AWS IAM 最小权限策略 (推荐):
为保障安全，建议为应用专设一个 IAM 用户，并仅赋予以下精简权限策略：
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LightsailLifecycleManagement",
      "Effect": "Allow",
      "Action": [
        "lightsail:GetInstances",
        "lightsail:GetInstance",
        "lightsail:CreateInstanceSnapshot",
        "lightsail:GetInstanceSnapshots",
        "lightsail:DeleteInstanceSnapshot",
        "lightsail:DeleteInstance",
        "lightsail:CreateInstancesFromSnapshot",
        "lightsail:GetOperations",
        "lightsail:GetOperation"
      ],
      "Resource": "*"
    }
  ]
}
```

---

### 2. Cloudflare DNS 访问凭证

用于在实例恢复并分配新公网 IP 后，自动更新您的域名解析记录。

| 环境变量 / 配置项 | 说明 | 示例值 |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | 具备 DNS 编辑权限的 API Token | `cf_tok_live_xxxxxxxxxxxxxxxxxxxx` |
| `CLOUDFLARE_ZONE_ID` | 目标域名所属的 Cloudflare Zone ID | `983b8a1e2f3c4d5e6a7b8c9d0e1f2a3b` |
| `CLOUDFLARE_RECORD_NAME` | 需要自动更新的 A 记录完整域名 | `vpn.mydomain.dev` 或 `node.example.com` |

#### 🛠️ 如何获取 Cloudflare API Token:
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/) ➔ 进入右上角 **My Profile (个人资料)** ➔ **API Tokens**。
2. 点击 **Create Token** ➔ 选择 **Edit zone DNS** 模板。
3. 权限设置为：`Zone - DNS - Edit`；资源范围设置为：`Include - All zones` 或选择您的特定域名。
4. 创建并妥善保存生成的 Token。
5. **Zone ID 获取**：点击您的域名控制台主页，在右侧栏下方「API」区域即可看到 **Zone ID**。

---

### 3. GitHub Actions 发布 Android APK 所需密钥 (Repository Secrets)

若希望通过 GitHub Actions 自动构建已签名的正式 Android APK，请在 GitHub 仓库 **Settings ➔ Secrets and variables ➔ Actions** 中添加：

| Secret 名称 | 说明 | 是否必填 |
| :--- | :--- | :--- |
| `ANDROID_KEYSTORE_BASE64` | Android `.keystore` 或 `.jks` 文件的 Base64 编码字符串 | 可选（留空则生成通用 Release APK） |
| `ANDROID_KEYSTORE_PASSWORD` | 签名密钥库密码 | 与 keystore 对应 |
| `ANDROID_KEY_ALIAS` | 签名密钥别名 (Key Alias) | 例如 `lightsail-key` |
| `ANDROID_KEY_PASSWORD` | 签名密钥独立密码 | 与 alias 密码对应 |
| `GITHUB_TOKEN` | 用于自动创建 GitHub Release 并上传 APK | **GitHub 自动提供，无需手动创建** |

#### 📱 如何生成自己的 Android Keystore:
在本地终端执行以下命令生成签名证书：
```bash
# 1. 生成密钥库文件
keytool -genkey -v -keystore release.keystore -alias lightsail-key -keyalg RSA -keysize 2048 -validity 10000

# 2. 导出为 Base64 字符串以填入 GitHub Secrets
base64 -w 0 release.keystore > keystore_base64.txt
# (macOS 用户使用: base64 -i release.keystore -o keystore_base64.txt)
```

---

## 🤖 GitHub Actions 自动发布流程

仓库已配置好完整的 `.github/workflows/release-app.yml` 工作流。

### 触发方式 1：推送版本标签（推荐）
在本地终端给代码打上语义化版本 Tag 并推送至 GitHub：
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub Actions 将自动执行：
1. **Build Web Applet**：依赖安装、TypeScript 校验与 Vite 生产构建。
2. **Build Android APK**：配置 Android SDK & JDK 17，通过 Capacitor/Gradle 构建 Android APK。
3. **Auto Sign APK**：若配置了密钥则自动签名，否则输出免签 APK。
4. **Create GitHub Release**：自动在 GitHub Releases 页面发布版本并附带生成的 `.apk` 下载文件。

### 触发方式 2：在 GitHub 网页手动点击构建
1. 访问 GitHub 仓库 ➔ 点击 **Actions** 标签页。
2. 在左侧选择 **Build and Release Android App** 工作流。
3. 点击右侧 **Run workflow** 按钮，输入版本号（如 `v1.0.1`）即可启动构建。

---

## 🧪 快速开始与本地开发

```bash
# 1. 克隆代码
git clone https://github.com/your-username/lightsail-android-manager.git
cd lightsail-android-manager

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 类型检查与代码校验
npm run lint

# 5. 生产构建打包
npm run build
```

打开浏览器访问 `http://localhost:3000` 即可开始使用：
- 点击右上角「**手机模式 / 宽屏模式**」可切换 Google Pixel 8 原生手机框或桌面宽屏视图。
- 默认已启用 **Floci 模拟器**，预置了东京 `prod-vpn`、俄勒冈 `dev-api` 以及已休眠的 `staging` 实例，点击卡片即可立即体验「保存快照并休眠」或「从快照恢复并自动更新 Cloudflare DNS」！
- 进入「**调试排查**」页面，可实时查看每一笔 API 调用报文，或模拟注入 429 / 504 故障测试系统防御逻辑。
