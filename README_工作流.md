# WorkHogee AI图像工作流 - 使用说明

## 概述

WorkHogee AI图像工作流是一个面向小商家的AI图像生成系统，首发两个场景：
- **餐饮菜品图**：自动识别菜品，匹配风格和角度，生成专业菜品图
- **家居/饰品场景图**：自动分析商品材质，匹配家居风格，生成场景合成图

## 系统架构

```
用户提交表单（飞书表单）
    ↓
任务队列（飞书多维表格）
    ↓
Agent工作流（Python脚本）
    ├── 知识库检索（飞书云文档）
    ├── 图像生成（可配置API）
    └── 结果写回（多维表格）
    ↓
状态看板（多维表格看板视图）
```

## 文件说明

| 文件 | 说明 |
|---|---|
| `agent_workflow.py` | 主工作流脚本，包含餐饮和家居饰品两个工作流 |
| `base_client.py` | 多维表格操作模块，负责读取任务、更新状态、上传图片 |
| `knowledge_base.py` | 知识库检索模块，从飞书云文档检索匹配的提示词 |
| `image_generator.py` | 图像生成接口模块，支持接入不同的图像生成API |
| `base_config.json` | 多维表格配置文件，包含base_token、table_id、字段ID映射 |
| `image_config.json` | 图像生成配置文件，包含API类型、密钥、扣费点数 |
| `启动工作流.bat` | Windows启动脚本 |
| `workflow.log` | 运行日志文件（自动生成） |

## 快速开始

### 1. 配置图像生成API

编辑 `image_config.json`：

```json
{
  "api_type": "dalle",
  "api_key": "your-openai-api-key",
  "api_base": "",
  "default_size": "1024x1024",
  "default_quality": "high",
  "fee_points_per_image": 1
}
```

支持的API类型：
- `placeholder`：占位符模式，生成占位图用于测试（默认）
- `dalle`：OpenAI DALL-E API
- `stable_diffusion`：Stability AI Stable Diffusion API

### 2. 启动工作流

**方式一：单次处理（推荐首次使用）**
```bash
python agent_workflow.py
```

**方式二：只处理指定行业**
```bash
python agent_workflow.py --industry 餐饮
python agent_workflow.py --industry 家居饰品
```

**方式三：限制处理数量**
```bash
python agent_workflow.py --limit 5
```

**方式四：守护进程模式（持续监控新任务）**
```bash
python agent_workflow.py --daemon --interval 60
```

**方式五：双击启动脚本**
```
双击 启动工作流.bat
```

## 工作流程

### 餐饮工作流

1. 从多维表格读取"待处理"的餐饮任务
2. 更新状态为"处理中"
3. 下载用户上传的输入图片
4. 从餐饮知识库检索匹配的风格（家常菜/精致摆盘/日式居酒屋/川湘麻辣/轻食健康）
5. 从餐饮知识库检索匹配的拍摄角度（45度俯拍/正上方俯拍/平视/特写微距）
6. 组装标准生图提示词
7. 如用户需求包含"抠图/去背景"，先进行抠图
8. 调用图像生成API生成图片
9. 上传输出图片到多维表格
10. 记录扣费点数
11. 更新状态为"已完成"

### 家居/饰品工作流

1. 从多维表格读取"待处理"的家居饰品任务
2. 更新状态为"处理中"
3. 下载用户上传的输入图片
4. 从家居知识库检索匹配的风格（北欧/侘寂/中古/法式/奶油风/工业风/日式原木/现代轻奢/ins风）
5. 从家居知识库检索匹配的材质光影模板（原木/陶瓷/玻璃/金属/织物）
6. 组装场景生成提示词
7. 抠图（移除商品背景）
8. 调用图像生成API进行场景合成
9. 上传输出图片到多维表格
10. 记录扣费点数
11. 更新状态为"已完成"

## 知识库

### 餐饮行业知识库
- 链接：https://my.feishu.cn/docx/DSnqd9J7QoTc5wxZG2HckFIunrK
- 内容：二十四节气菜品氛围词库、拍摄角度规范、平台尺寸规范、5种菜品风格模板

### 家居/饰品行业知识库
- 链接：https://my.feishu.cn/docx/PSlEdHwPTohBesxmshActwTbnig
- 内容：10种风格描述词、6种材质光影模板、淘宝/小红书尺寸构图规范

## 任务提交

用户通过飞书表单提交任务：
- 表单链接：https://my.feishu.cn/share/base/shrcnsiBvf3eW7hRu6vtBUZExFc
- 题目：
  1. 选择行业（必填，单选：餐饮/家居饰品）
  2. 上传原始图片（必填，附件）
  3. 描述您的需求（选填，文本）

## 状态看板

- 看板链接：https://my.feishu.cn/base/GvLWbAZA5aNwkrsuxjEc5bjvnxt
- 视图：任务看板（按状态分组）
- 四列：待处理 → 处理中 → 已完成 → 失败
- 支持拖拽卡片更新状态

## 常见问题

### Q: 如何接入其他图像生成API？
A: 编辑 `image_generator.py`，在 `_generate_xxx` 方法中添加新的API实现，然后在 `image_config.json` 中设置对应的 `api_type`。

### Q: 如何调整扣费点数？
A: 编辑 `image_config.json`，修改 `fee_points_per_image` 字段。

### Q: 如何添加新的风格模板？
A: 编辑对应的飞书云文档知识库，添加新的风格描述词和提示词。然后在 `knowledge_base.py` 中添加对应的关键词匹配逻辑。

### Q: 工作流运行失败怎么办？
A: 查看 `workflow.log` 日志文件，定位错误原因。常见问题包括：API Key未配置、网络连接失败、图片格式不支持等。

### Q: 如何批量处理历史任务？
A: 将多维表格中任务的状态改为"待处理"，然后运行工作流即可。

## 技术支持

如有问题，请查看日志文件 `workflow.log` 或联系技术支持。
