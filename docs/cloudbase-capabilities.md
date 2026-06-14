# CloudBase 能力盘点

更新日期：2026-06-06

## 1. 结论

CloudBase 的平台能力可以覆盖本项目 Phase 2 所需的邮箱认证、文档型数据库、服务端事务、云函数/HTTP API、对象存储和客户端数据权限控制。微信支付可由 CloudBase 承载服务端接入，但本次未确认到可直接复用的支付 MCP 工具；支付宝也未确认到 CloudBase 原生或 MCP 直连能力，两者都应继续通过项目自有 `PaymentProvider` 适配。

当前 Codex 会话已连接 CloudBase MCP 2.21.1，并绑定开发环境
`yunwuwei-d0gqca7d478fcf658`。环境位于 `ap-shanghai`，状态正常。

2026-06-07 已实际确认：

- 邮箱登录和手机号登录均已开启。
- 邮箱 provider 状态为 `TRUE`，使用腾讯云默认发件地址
  `cloudbase_noreply@tencent.com`。
- 手机号登录属于内置登录策略，没有独立 provider 条目。
- publishable key 已创建，可供 Web SDK 使用。
- 用户名密码登录未开启；这不影响邮箱 OTP 和手机号 OTP 登录。
- 当前环境没有数据库集合和云函数。
- 体验版套餐无法新增本地安全域名，浏览器本地联调仍受此限制。

本轮只完成能力盘点，不实现账号、后端或部署代码。

## 2. 验证分级

| 级别 | 含义 |
|---|---|
| 本会话已验证 | 通过当前工具列表和项目文件直接确认 |
| 官方文档已确认 | CloudBase 官方文档明确支持，但未连接真实环境验证 |
| 待环境实测 | 必须安装 MCP/SDK、登录并绑定环境后验证 |

## 3. 当前 Skill/MCP 状态

### 本会话已验证

- CloudBase MCP 2.21.1 已加载，开发者登录和环境绑定状态均为 `READY`。
- 当前环境 ID 为 `yunwuwei-d0gqca7d478fcf658`。
- 邮箱和手机号登录策略均已开启。
- 邮箱 provider 已启用；手机号登录是内置策略，不使用 provider 条目。
- 数据库实例和对象存储运行正常；集合和云函数当前为空。
- 当前体验版套餐拒绝新增 `127.0.0.1:5173` 和 `localhost:5173`
  安全域名。

### 官方文档已确认

CloudBase MCP 官方文档当前描述 36 个工具，覆盖环境认证与绑定、数据库集合和文档、索引、云函数、云托管、静态托管及对象存储管理。官方推荐通过 CloudBase CLI 安装 MCP，并由 AI IDE 配置 `cloudbase-mcp`。

注意：MCP 中的 `auth` 是开发者登录腾讯云并绑定 CloudBase 环境的管理工具，不等同于产品最终用户的邮箱登录。

### 待环境实测

1. 使用真实邮箱发送并验证 OTP。
2. 使用真实手机号发送并验证 OTP。
3. 在可配置安全域名的套餐或 CloudBase 托管域名上完成浏览器端到端测试。
4. 仅在用户明确授权后创建集合、函数或执行部署。

## 4. 身份认证

### 官方文档已确认

CloudBase 登录认证 v2 支持邮箱和密码注册、登录、登出、会话读取及刷新。邮箱注册需要启用邮箱登录、配置 SMTP 发件人和验证邮件跳转地址。会话包含 access token 和 refresh token。

HTTP 访问服务可以开启身份认证。Web 客户端登录后取得 access token，通过 `Authorization: Bearer <token>` 调用受保护的 HTTP 服务；CloudBase 在网关层校验令牌。官方还提供“当前用户信息”接口用于根据 access token 获取用户资料。

### 推荐接入

- 浏览器侧使用 CloudBase Web SDK v2/v3 完成邮箱注册、登录、登出和会话恢复。
- `AuthPort` 只暴露项目需要的用户、会话和认证状态，不把 CloudBase SDK 类型扩散到 UI 或领域层。
- 业务 API 优先使用开启身份认证的 CloudBase HTTP 访问服务。
- 服务端业务逻辑从网关透传的已验证身份中取得用户 ID；不要信任请求体中的 `userId`。
- 用户资料使用独立集合保存业务字段，认证主体 ID 作为稳定外键。

### 待环境实测

- 邮箱和手机号 OTP 的真实发送、频控和验证码校验。
- 默认邮箱模板、验证链接和投递质量。
- access token 在目标 HTTP 函数/云托管入口中的身份透传字段。
- 多设备登出、令牌吊销、密码重置和邮箱变更的产品行为。

## 5. 文档型数据库

### 官方文档已确认

- 支持集合和 JSON 文档的增删改查、查询、聚合、实时推送及数据模型。
- 支持单字段、复合、唯一和地理位置索引。
- 支持多文档事务并保证 ACID。
- 事务当前只支持服务端执行，官方事务文档指定 Node.js SDK。
- 数据库安全规则提供文档级权限控制，可使用 `auth.uid`、`auth.openid`、文档字段和有限的跨文档 `get`。
- 客户端查询条件必须满足安全规则约束；规则引用的字段通常必须出现在查询条件中。

### 推荐接入

- `users`、`projects`、`tool_documents` 可允许用户态最小权限访问，仍优先通过仓储端口封装。
- `orders`、`credit_ledger`、`credit_reservations`、支付事件和审计记录设为客户端无权限，只允许服务端访问。
- `tool_documents` 使用 `(projectId, id)`、`ownerId/projectId` 和更新时间等实际查询路径设计复合索引。
- 幂等键建立唯一索引；文档保存使用 `revision` 条件更新实现乐观锁。
- 订单入账、额度发放、预占/提交/释放使用服务端事务。

### 待环境实测

- 目标套餐的事务、索引、容量、并发和配额限制。
- MCP 是否支持事务执行，或只负责资源管理和普通 CRUD。
- 安全规则的实际部署、版本管理和本地测试方式。
- 唯一索引冲突、事务重试和热点文档行为。

## 6. 云函数与 HTTP API

### 官方文档已确认

- 支持普通云函数和 HTTP 云函数。
- 可以通过 HTTP 访问服务把云函数暴露为标准 HTTP 接口。
- CloudBase CLI 支持部署、列出和配置 HTTP 云函数。
- 函数安全规则可限制客户端 SDK 调用，但不适用于管理端调用、定时触发器和数据库触发器。
- HTTP 服务可以单独开启身份认证。

### 推荐接入

- 账号后的业务 API、模型代理、支付回调和额度扣减放在 HTTP 云函数或云托管中。
- 前端不直接调用 Admin SDK，不保存 API Key、SecretId、SecretKey、支付密钥或模型密钥。
- 支付回调路径使用支付平台签名验证，不依赖 CloudBase 用户登录态。
- 普通用户业务路径开启 HTTP 身份认证，并在应用层继续做资源归属校验。

### 待环境实测

- 目标地域、运行时、超时、并发、冷启动和日志能力。
- 自定义域名、备案、CORS、回调公网可达性。
- Vercel 现有部署与 CloudBase HTTP 服务的迁移或共存方式。

## 7. 对象存储

### 官方文档已确认

- 支持文件上传、下载、删除、列表和临时访问链接。
- 支持基础权限和文件级安全规则。
- 私有文件不能直接依赖永久 URL，需要临时访问链接。
- 存储安全规则只限制客户端请求；服务端和控制台具有管理权限。
- CloudBase MCP 文档区分静态网站上传与对象存储管理，两者不是同一用途。

### 推荐接入

- 用户截图和附件使用私有路径，例如 `users/{uid}/projects/{projectId}/...`。
- 数据库只保存文件引用、所有者、MIME、大小和校验信息，不长期保存 base64。
- 上传由用户态 SDK 配合严格规则完成，或由服务端签发受限上传流程。
- 下载通过短期 URL 或鉴权后的服务端转发，避免公开用户原始附件。
- 导出文件按产品需求设置短生命周期并定期清理。

### 待环境实测

- Web SDK 上传接口、文件所有者字段和规则表达式在登录认证 v2 下的实际行为。
- 临时 URL 有效期、刷新方式和跨域配置。
- 文件大小、类型、恶意内容扫描及生命周期策略。

## 8. 用户态与 Admin 边界

| 能力 | 浏览器用户态 | 服务端/Admin |
|---|---|---|
| 邮箱注册、登录、会话 | 允许 | 可验证令牌和读取必要身份 |
| 用户自己的项目和文档 | 最小权限，可选直连 | 完整业务校验和仓储操作 |
| 订单、额度、支付事件 | 禁止直连 | 必须服务端处理 |
| 数据库事务 | 不使用 | 服务端执行 |
| 用户附件上传 | 严格规则下允许 | 可签发、审计、删除 |
| 私有附件访问 | 临时 URL | 生成临时 URL 或代理 |
| 函数/数据库/存储资源管理 | 禁止 | 管理端或部署流程 |
| SecretId/SecretKey/API Key | 禁止 | 托管环境变量或临时凭证 |

CloudBase 服务端 SDK 支持 API Key、腾讯云固定密钥、临时凭证和托管运行环境凭证。生产环境优先使用托管身份、API Key 或最小权限临时凭证，禁止把固定密钥写入仓库或前端包。

## 9. 微信支付与支付宝

### 官方文档已确认

CloudBase 产品资料说明平台与微信生态和微信支付集成，但本次查询未确认到当前 CloudBase MCP 的支付专用工具，也未确认到覆盖本项目 Web 付费场景的通用支付业务 API。CloudBase 可以可靠承载支付下单服务、回调接口、事务入账和定时对账。

本次未找到 CloudBase 官方资料证明支付宝是 CloudBase 原生能力或 MCP 直连能力。

### 接入边界

- 保留项目自有 `PaymentProvider`。
- 微信支付和支付宝分别实现服务端适配器。
- CloudBase 只承担安全运行环境、HTTP 回调、数据库、事务、密钥托管和日志。
- 支付成功只以服务端验签回调和主动查单为准。
- 回调事件、订单状态迁移和额度发放必须幂等。

### 待确认

- 商户主体、微信支付产品类型、支付宝产品类型。
- 回调域名及备案要求。
- 证书、平台公钥、API v3 Key 等密钥的托管和轮换方案。
- CloudBase 套餐标注的微信支付支持是否适用于本项目 Web 场景。

## 10. 后续实现前置条件

1. 创建开发和生产 CloudBase 环境，明确地域和套餐。
2. 安装 CloudBase MCP 或提供已配置连接，并确认版本。
3. 绑定开发环境，只读盘点现有资源。
4. 启用登录认证 v2，配置邮箱 SMTP 和允许域名。
5. 确认 HTTP API 的部署形态：云函数或云托管。
6. 定义集合、索引和权限规则，再实现仓储适配器。
7. 为私有附件确定上传和临时 URL 流程。
8. 单独完成支付商户和回调前置条件，不依赖 CloudBase MCP 代替支付 SDK。

## 11. 官方资料

- [CloudBase MCP 工具](https://docs.cloudbase.net/en/ai/cloudbase-ai-toolkit/mcp-tools)
- [CloudBase MCP 安装与常见问题](https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/faq)
- [邮箱登录](https://docs.cloudbase.net/authentication/method/email-login)
- [Web 登录认证 v2 API](https://docs.cloudbase.net/en/api-reference/webv2/authentication)
- [HTTP 身份认证](https://docs.cloudbase.net/service/authentication)
- [文档型数据库](https://docs.cloudbase.net/database/introduce)
- [索引管理](https://docs.cloudbase.net/database/data-index)
- [事务操作](https://docs.cloudbase.net/en/database/transaction)
- [数据库安全规则](https://docs.cloudbase.net/database/security-rules)
- [HTTP 访问云函数](https://docs.cloudbase.net/service/access-cloud-function)
- [云函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)
- [云存储基础权限](https://docs.cloudbase.net/storage/data-permission)
- [云存储安全规则](https://docs.cloudbase.net/storage/security-rules)
- [服务端 SDK 初始化与凭证](https://docs.cloudbase.net/en/api-reference/server/node-sdk/initialization)
