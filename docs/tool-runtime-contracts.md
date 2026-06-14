# 工具运行时契约

更新日期：2026-06-08

## 目的

`tool-runtime` 定义工具接入平台时必须遵守的稳定边界。领域契约不依赖 React、DOM、Chakra UI、数据库、模型供应商或部署环境。

当前仓库已经不止停留在“只建契约”阶段。Journey Map 已作为第一条正式工具接入本契约，并被页面层、持久化层和 AI 层共同消费。

## 文件边界

| 文件 | 责任 |
|---|---|
| `src/domain/tool-runtime.ts` | 工具元数据、文档、命令、导出、迁移和 AI 接口 |
| `src/application/tool-runtime.ts` | 创建文档、乐观锁命令执行、迁移和导出用例 |
| `src/tools/registry.ts` | 工具注册与查询入口 |

## 核心约定

### 工具定义

`ToolDefinition<TContent, TCommand>` 是工具接入平台的唯一领域入口：

- `metadata` 描述工具身份、分类和输入输出能力。
- `documentVersion` 是当前内容 Schema 版本，从 `1` 开始。
- `createInitialDocument` 创建工具内容，不创建持久化信封。
- `validateDocument` 是所有外部数据和命令结果的运行时校验边界。
- `applyCommand` 必须是纯函数，不执行网络、存储或 UI 副作用。
- `migrations` 必须按相邻版本逐步迁移旧内容，不允许 `1 -> 3` 跨级。
- `exports` 将完整 `ToolDocument` 转换为导出产物。
- `ai` 只构建上下文和解析结构化提案，不能直接修改文档。

### 工具文档

`ToolDocument<TContent>` 是跨工具共享的持久化信封。工具只拥有 `content` 的结构，平台拥有标识、项目归属、Schema 版本、revision 和时间字段。

`revision` 用于保存和命令执行的乐观锁。命令的 `expectedRevision` 与当前文档不一致时，运行时抛出 `REVISION_CONFLICT`，调用方必须刷新或显式合并，不能静默覆盖。

### 命令

命令是用户、AI 和系统修改文档的唯一结构化入口。每条命令包含：

- 唯一 `id`；
- 可辨识的 `type` 和类型化 `payload`；
- `expectedRevision`；
- 发起时间与 actor。

AI 返回的命令仍需用户确认，再由 `applyToolCommand` 执行。成功执行一次命令只增加一次 revision，并返回可用于审计的 `ToolCommandResult`。

### 迁移

迁移只处理 `content`，不能修改文档 id、项目归属或 revision。`migrateToolDocument` 从文档当前版本沿迁移链前进，最后再次调用 `validateDocument`。

缺少迁移、迁移倒退、迁移链未到当前版本或文档版本高于运行时版本都会显式失败。

### 序列化边界

文档 `content` 必须能无损经过 JSON 序列化和反序列化。创建、命令执行和迁移都会拒绝 `undefined`、函数、`bigint`、非有限数字、负零、稀疏数组、循环引用、Symbol 属性、不可枚举/访问器属性和非普通对象，错误码为 `NON_SERIALIZABLE_DOCUMENT`。

导出产物允许使用 `Uint8Array`，但持久化文档内容不能依赖类实例、`Date`、`Map` 或 `Set`。

### 导出

导出适配器以 `format` 注册，返回文件名、媒体类型和字符串或二进制数据。适配器可以同步或异步，但不得修改传入文档。

## 最小工具样例

```ts
import type {
  ToolCommand,
  ToolDefinition,
} from "../src/domain/tool-runtime"

type Note = { text: string }
type RenameNote = ToolCommand<"rename", { text: string }>

export const noteTool: ToolDefinition<Note, RenameNote> = {
  metadata: {
    id: "note",
    name: "便签",
    description: "契约示例",
    category: "example",
    tags: [],
    inputKinds: ["text"],
    outputKinds: ["text"],
  },
  documentVersion: 1,
  createInitialDocument: () => ({ text: "" }),
  validateDocument: (input) => {
    if (
      typeof input !== "object" ||
      input === null ||
      typeof (input as Note).text !== "string"
    ) {
      throw new Error("Invalid note")
    }
    return input as Note
  },
  applyCommand: (_document, command) => ({ text: command.payload.text }),
  migrations: [],
  exports: [],
}
```

正式工具定义完成后，在 `src/tools/registry.ts` 的组合根注册。注册表是异构集合，因此查询结果需要根据稳定的 `metadata.id` 收窄回具体工具定义。

当前状态：

- `journey-map` 已注册
- Journey 页面层通过正式工具模块消费领域规则与导出逻辑
- 文档保存、proposal 应用与导出都依赖正式 `ToolDocument` 信封

## 自动验证

契约测试不引入额外依赖，先把三个纯 TypeScript 模块编译为临时 CommonJS，再使用 Node 内置测试运行：

```powershell
npx tsc -p tsconfig.tool-runtime-tests.json
node --test tests/tool-runtime.test.cjs
```

测试覆盖：

- 文档创建、Schema 版本和初始 revision；
- 命令执行、revision 单次递增和重复提交冲突；
- 相邻迁移链、迁移缺失和跨级迁移拒绝；
- 非法定义、重复工具和未知工具；
- JSON 无损序列化边界；
- 导出适配器选择和未知格式；
- 与当前 Journey Map 的阶段、行、单元格、情绪字段、AI proposal 和 JSON 导出形状兼容。

Journey Map 已不再只是兼容夹具，而是当前的真实工具基线。后续新增工具需要以同等严格度补齐：

- 领域校验
- 命令执行
- proposal 规范化
- 导出契约
- 最小回归测试

## 消费方责任

- 持久化层负责保存 revision，并在更新条件中校验旧 revision。
- API/BFF 负责鉴权、项目归属校验、幂等和错误映射。
- AI 编排层负责校验提案、请求用户确认，并逐条提交命令。
- UI 只渲染文档和发出命令，不直接改写持久化对象。
- 工具实现负责可靠的运行时校验；TypeScript 类型不能替代外部数据校验。
