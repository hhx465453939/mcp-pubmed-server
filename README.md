# PubMed Data Server v2.0

**极简架构，专注数据提供** - 为LLM提供结构化的PubMed文献数据

---

## 🎯 核心理念

**MCP服务器 = 数据提供者，外部LLM = 智能分析**

```
用户客户端(LLM) ←→ MCP服务器(PubMed数据) ←→ PubMed API
     ↑                      ↑
  智能分析              数据获取+结构化
```

**核心优势：**
- ✅ **极简配置**：只需PubMed API和邮箱
- ✅ **LLM友好**：结构化输出，优化上下文窗口
- ✅ **高效检索**：批量查询、交叉引用、事实核查

---

## 🚀 快速部署

### 前置要求
安装Node.js (v18.0.0+)：[nodejs.org](https://nodejs.org/)

### 步骤一：下载项目
```bash
git clone [项目地址] mcp-pubmed-server
cd mcp-pubmed-server
```

### 步骤二：安装依赖
```bash
npm install
```

### 步骤三：配置API密钥
```bash
cp .env.example .env
# 编辑.env文件，填入以下内容：
```

```env
PUBMED_API_KEY=你的NCBI_API密钥
PUBMED_EMAIL=你的邮箱地址
```

**获取API密钥：**
1. 访问 [NCBI API Key Management](https://www.ncbi.nlm.nih.gov/account/settings/)
2. 登录NCBI账户，生成API密钥

### 步骤四：测试服务器
```bash
node src/index.js
# 看到 "PubMed Data Server v2.0 running on stdio" 表示成功
```

### 步骤五：MCP客户端配置

#### Cline配置：
```json
{
  "mcpServers": {
    "pubmed-data-server": {
      "command": "node",
      "args": ["./src/index.js"],
      "cwd": "完整路径/to/mcp-pubmed-server",
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱"
      }
    }
  }
}
```

#### Cherry Studio/Windows配置：
```json
{
  "mcpServers": {
    "pubmed-data-server": {
      "command": "node",
      "args": ["E:/fsdownload/mcp-pubmed-server/src/index.js"],
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱"
      }
    }
  }
}
```

#### Claude Desktop：
使用 `config/claude_desktop_config.json` 模板

### 步骤六：验证集成
在客户端中测试：`使用pubmed_search工具搜索"acupuncture"`

---

## 🛠️ 5个高效工具

### 1. `pubmed_search` - 智能文献搜索
```json
{
  "query": "acupuncture gut microbiome",
  "max_results": 20,
  "days_back": 30,
  "sort_by": "relevance"
}
```

### 2. `pubmed_get_details` - 详细信息获取
```json
{
  "pmids": ["38412345", "38412346"],
  "include_full_text": true
}
```

### 3. `pubmed_extract_key_info` - 关键信息提取
```json
{
  "pmid": "38412345",
  "extract_sections": ["basic_info", "abstract_summary", "authors", "keywords"],
  "max_abstract_length": 2000
}
```

### 4. `pubmed_cross_reference` - 交叉引用分析
```json
{
  "pmid": "38412345",
  "reference_type": "similar",
  "max_results": 10
}
```

### 5. `pubmed_batch_query` - 批量查询优化
```json
{
  "pmids": ["38412345", "38412346", "38412347"],
  "query_format": "llm_optimized",
  "include_abstracts": true
}
```

---

## 🏗️ 架构特色

### 📊 LLM优化输出
- **简洁格式**：标题、作者、期刊、日期
- **详细格式**：完整元数据+结构化摘要
- **LLM优化格式**：智能截断、关键点提取、关键词组织

### 🧠 上下文窗口管理
- 自动截断过长摘要（1500字符）
- 关键点提取（5个要点）
- 结构化信息分层

### 🔍 事实核查支持
- 交叉引用相关文献
- 相似研究对比
- 综述文献查找

### ⚡ 性能优化
- 速率限制管理（PubMed API限制）
- 批量查询优化（最多20个PMID）
- 错误重试机制

---

## 📝 使用场景

### 🔬 学术研究辅助
```
用户：我想了解针灸治疗肠易激综合征的最新研究
LLM → pubmed_search → 获取数据 → 智能分析和总结
```

### ✅ 事实核查
```
用户：这篇论文说某种化合物能治疗癌症，是真的吗？
LLM → pubmed_get_details → pubmed_cross_reference → 核查相关研究
```

### 📈 文献综述
```
用户：帮我分析某个领域的研究趋势
LLM → 批量查询 → 趋势分析 → 研究方向建议
```

### 💡 生物学问答
```
用户：某个蛋白质的功能是什么？
LLM → pubmed_search → pubmed_extract_key_info → 精准回答
```

---

## 📁 项目结构

```
mcp-pubmed-server/
├── src/
│   └── index.js              # 主服务器代码
├── config/
│   ├── mcp-config.json       # MCP配置模板
│   └── claude_desktop_config.json  # Claude Desktop配置
├── .env.example              # 环境变量模板
├── package.json              # 项目依赖配置
└── README.md                 # 本文件
```

---

## 🔍 故障排除

### 常见问题

1. **"找不到模块 @modelcontextprotocol/sdk"**
   ```bash
   npm install
   ```

2. **"PubMed API调用失败"**
   - 检查API密钥是否正确
   - 确认网络连接正常
   - 等待速率限制重置

3. **"环境变量未设置"**
   - 确保 `.env` 文件存在
   - 检查变量名拼写

4. **Cherry Studio配置错误**
   - 使用完整路径到 `src/index.js`
   - 不要使用 `cwd` 参数
   - 使用正斜杠 `/` 或双反斜杠 `\\`

### 部署清单
- [ ] Node.js已安装
- [ ] 依赖已安装 (`npm install`)
- [ ] `.env` 文件已配置
- [ ] 服务器可正常启动
- [ ] MCP客户端配置正确

---

## 📄 许可证

Apache License 2.0

---

**🎉 简单、高效、专注 - 现代MCP服务标准**

*版本 2.0 - 简化架构，专注数据提供*