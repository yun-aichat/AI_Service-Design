# 阶段验收清单

这份清单基于当前 `main` 分支整理，用于本阶段收尾验收。范围只覆盖当前已经落地的核心链路：账号鉴权、正式持久化、Billing、AI 积分结算、AI usage 事件记录。

## 使用方式

1. 先执行自动化验证。
2. 再进行人工功能验收。
3. 最后完成仓库与流程收尾检查。

---

## 1. 自动化验证

- [x] `npm run build` 通过
- [x] `npm run test:auth` 通过
- [x] `node --test server/tool-documents.test.cjs server/application/tool-documents.test.cjs server/infrastructure/cloudbase/tool-documents/repository.test.cjs` 通过
- [x] `node --test server/application/billing-portal.test.cjs server/application/billing-config.test.cjs server/infrastructure/cloudbase/billing/repository.test.cjs` 通过
- [x] `node --test server/application/billing/index.test.cjs` 通过
- [x] `node --test server/application/assistant/service.test.cjs server/application/assistant/usage-recorder.test.cjs server/journey-chat.test.cjs` 通过
- [x] `node --test server/infrastructure/cloudbase/auth/verify-access-token.test.mjs` 通过
- [x] `node --check scripts/billing-acceptance-host.cjs` 通过
- [x] `git diff --check` 通过
- [x] 测试输出中没有新的阻断级错误，仅保留已知 warning

## 2. 账号与鉴权验收

- [x] `/account` 页面可正常打开
- [x] 可以完成一次真实登录
- [x] 刷新页面后登录态可恢复
- [x] 登出后受保护接口返回未认证
- [x] Billing 页面在未登录时有明确空态或登录引导
- [x] 服务端 token 校验命中正式 CloudBase 链路
- [x] 前端不依赖匿名登录或测试专用鉴权能力

### 边界场景

- [x] 登录态过期后再次请求受保护接口，返回未认证而不是脏数据
- [x] token 非法、缺失或格式错误时，服务端返回明确错误
- [x] 已登录用户刷新 `/billing`、`/admin`、`/account` 时不会短暂显示错误用户态
- [x] 非 admin 用户访问 `/admin` 时被稳定拒绝，而不是进入空白页或半加载状态

## 3. Journey 正式持久化验收-功能未完成，无法正常校验

- [ ] 可以新建一个 Journey 文档
- [ ] 修改内容后可以成功保存
- [ ] 刷新页面后能重新读回同一文档
- [ ] revision 正常递增，没有回退
- [ ] assistant 请求后能产生 usage event
- [ ] 缺失数据库配置时返回明确错误，而不是静默失败

### 边界场景

- [ ] 同一文档连续保存两次，不会产生 revision 覆盖或倒退
- [ ] 并发或旧 revision 提交时，返回明确冲突而不是静默覆盖
- [ ] 文档不存在但项目存在时，系统按约定创建默认文档或给出明确错误
- [ ] 服务重启或页面刷新后，已保存文档不会丢失
- [ ] usage event 写入失败时，不会反向导致文档主保存链路崩溃
- [ ] 本地验收宿主 `http://127.0.0.1:4173/` 打开首页时，不出现“持久化请求失败”
- [ ] 点击“保存”成功后刷新页面，能恢复刚刚保存的内容，而不是回到默认文档
- [ ] 未点击“保存”时，产品是否允许刷新后丢失修改，已有明确结论；如不允许，需补本地草稿缓存方案

## 4. 用户侧 Billing 验收

- [x] `/billing` 页面可正常打开
- [x] 登录后能看到当前用户余额
- [x] 能看到积分套餐或产品信息
- [x] 能看到流水第一页
- [x] 能翻到第二页
- [x] 空数据状态展示正常
- [ ] 缺少配置时展示明确错误态
- [ ] 页面只能读取当前登录用户数据，不能越权读取其他账户-目前账号默认的用户数据都一样，暂时无法判断，且没有可以调节数据的功能；等待闭环完成后进行校验吧

### 边界场景

- [ ] 余额为 `0` 时页面展示正常，不出现负数、NaN 或空白
- [ ] 没有任何 ledger 记录时，空状态展示正确
- [ ] ledger 仅 1 页时，分页控件不误导用户继续翻页
- [ ] ledger 恰好跨页边界时，第一页和第二页无重复、无丢失
- [ ] 请求失败、超时或接口返回 500 时，页面进入明确错误态
- [ ] 用户无法通过改 query、改请求体或前端参数读取其他账户账本

## 5. 管理侧 Billing/Usage 验收

- [ ] admin 用户可以进入管理入口
- [ ] 非 admin 用户不能进入
- [ ] usage 数据能读到正式记录
- [ ] cost 数据能读到正式记录
- [ ] ledger 数据能读到正式记录
- [ ] 空数据状态和错误状态能区分
- [ ] 不会因为字段缺失或未定义依赖导致服务直接崩溃

### 边界场景

- [ ] admin 有权限但集合为空时，页面展示空状态而不是报错
- [ ] 非 admin 用户直接请求后台接口时，服务端稳定返回拒绝
- [ ] usage/cost/ledger 其中一类数据缺失时，不拖垮整个后台页
- [ ] 单条 usage event 字段不完整时，后台能容错展示或明确提示
- [ ] 后台查询分页边界正常，无重复、无漏项
- [ ] 后台接口在 CloudBase 配置缺失时返回明确错误码

## 6. AI 积分结算验收-journey页面还未设计更新成可以ai交互的样式，暂时无法验收

- [ ] Journey assistant 请求在模型生成前先预占积分
- [ ] 返回 `proposal` 时提交预占并真实扣分
- [ ] 返回 `clarify` 时释放预占且不扣分
- [ ] 超时或运行时错误时释放预占且不扣分
- [ ] 每次重试都会产生新的 `ai_run` 和新的 reservation
- [ ] 积分不足时在模型调用前直接失败
- [ ] 没有有效 proposal 时不会扣分
- [ ] 单次生成不会发生重复扣分

### 边界场景

- [ ] 模型返回非法 JSON 时释放预占，不扣分
- [ ] 模型返回未知 phase 时释放预占，不扣分
- [ ] `clarify` 缺失必填字段时视为失败并释放预占
- [ ] assistant 在 `reserve` 阶段失败时，不进入模型调用
- [ ] 同一个用户连续多次重试时，每次都生成新的 `ai_run` / `referenceId`
- [ ] 同一次 `referenceId` 不会被重复 `commit`
- [ ] 积分刚好等于本次扣费额度时，可以成功预占并完成结算
- [ ] 积分小于本次扣费额度时，明确返回余额不足
- [ ] `proposal` 成功但 usage event 写入失败时，不影响主扣费结果一致性

## 7. AI Usage 事件验收

- [ ] 成功的 `proposal` 事件记录为 `status=succeeded`
- [ ] 成功的 `message` 事件记录为 `status=succeeded`
- [ ] `clarify` 事件记录为 `status=cancelled`
- [ ] error、timeout、null response 事件记录为 `status=failed`
- [ ] 只有成功且实际扣分的事件记录为 `billingStatus=charged`
- [ ] 非成功场景始终记录 `chargedCredits=0`
- [ ] 不存在 `cancelled + charged` 这类矛盾状态
- [ ] `billingStatus` 可以作为查询过滤条件

### 边界场景

- [ ] `proposal` 成功但 `chargedCredits=0` 时，事件应为 `not_charged`
- [ ] `clarify` 即使收到非零 `chargedCredits` 输入，也会被强制归零
- [ ] `error` / `timeout` / `null response` 都会落到 `failed`
- [ ] `message` 成功不会误记为 `cancelled`
- [ ] 同一个 `runId` 的事件标识规则稳定，不会发生覆盖错乱
- [ ] `billingStatus=charged` 过滤结果只返回已实际扣分事件
- [ ] 不完整 usage 数据不会导致整条记录写入崩溃

## 8. 收尾检查

- [ ] `git status --short --branch` 干净
- [ ] Git 中没有误追踪 `.worktrees/*`
- [ ] Roundtable Lite 没有 `in_progress` 任务
- [ ] Roundtable Lite 没有 `review` 任务
- [ ] Roundtable Lite 没有 `changes_requested` 任务
- [ ] 本阶段任务都能追溯到对应的 commit 和 review 记录
- [ ] `main` 就是最终验收基线，没有关键功能只停留在侧分支

---

## 建议通过标准

当第 2、3、4、6、7、8 部分全部勾完时，这一阶段可以视为正式收尾完成。
