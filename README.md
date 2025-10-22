```
██████╗ ██╗   ██╗██████╗ ███╗   ███╗███████╗██████╗     ██████╗  █████╗ ████████╗ █████╗ 
██╔══██╗██║   ██║██╔══██╗████╗ ████║██╔════╝██╔══██╗   ██╔════╝ ██╔══██╗╚══██╔══╝██╔══██╗
██████╔╝██║   ██║██████╔╝██╔████╔██║█████╗  ██║  ██║   ██║  ███╗███████║   ██║   ███████║
██╔═══╝ ██║   ██║██╔══██╗██║╚██╔╝██║██╔══╝  ██║  ██║   ██║   ██║██╔══██║   ██║   ██╔══██║
██║     ╚██████╔╝██████╔╝██║ ╚═╝ ██║███████╗██████╔╝   ╚██████╔╝██║  ██║   ██║   ██║  ██║
╚═╝      ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═════╝     ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
```

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version: v2.0](https://img.shields.io/badge/Version-v2.0-brightgreen)](https://github.com/your-repo/mcp-pubmed-server)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-orange)](https://modelcontextprotocol.io/)
[![PubMed API](https://img.shields.io/badge/PubMed-API-blue)](https://www.ncbi.nlm.nih.gov/books/NBK25501/)
[![EndNote Export](https://img.shields.io/badge/EndNote-Export-green)](docs/ENDNOTE_EXPORT.md)

# 🧬 PubMed Data Server v2.0

**🔬 极简架构，专注数据提供** - 为LLM提供结构化的PubMed文献数据

---

## 🎯 核心功能

> **四大核心功能，满足学术研究的全方位需求**

### 📚 **论文索引搜索** - 智能文献检索
- **关键词搜索**：支持复杂查询语法，精准定位相关文献
- **批量查询**：一次获取多篇论文的详细信息  
- **交叉引用**：发现相关研究，构建知识网络
- **事实核查**：验证研究结论，提供证据支持

### 💾 **智能缓存系统** - 高效数据管理
- **本地缓存**：避免重复API调用，提升响应速度
- **缓存统计**：实时监控缓存状态和存储使用情况
- **智能更新**：自动检测数据变化，保持缓存新鲜度
- **存储优化**：压缩存储，节省磁盘空间

### 📄 **OA论文全文下载** - 开放获取文献获取
- **全文检测**：自动识别可下载的开放获取论文
- **智能下载**：模拟人类行为，避免被反爬虫机制拦截
- **批量处理**：支持大量论文的批量下载和管理
- **格式支持**：PDF格式，便于阅读和引用

### 📋 **EndNote格式导出** - 文献管理集成
- **RIS格式**：兼容EndNote、Zotero等主流文献管理软件
- **BibTeX格式**：支持LaTeX写作和学术引用
- **自动导出**：查询结果自动生成引用文件
- **批量处理**：支持大量文献的批量导出

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

> 环境变量说明：项目已内置 `.env` 自动加载（使用 dotenv）。在项目根目录创建 `.env`，例如：

```env
PUBMED_API_KEY=你的NCBI_API密钥
PUBMED_EMAIL=你的邮箱地址
# 摘要截断模式：quick | deep
# quick：1500 字符（快速检索，可能不包含完整摘要）
# deep：6000 字符（深度检索；建议模型上下文窗口 ≥ 120k tokens）
ABSTRACT_MODE=quick
# 全文模式：disabled | enabled | auto
# disabled：禁用全文功能（默认）
# enabled：启用全文检测，手动下载
# auto：启用全文检测，自动下载可用的OA论文
FULLTEXT_MODE=disabled
# EndNote导出：enabled | disabled
# enabled：自动导出RIS和BibTeX格式（默认）
# disabled：禁用EndNote导出
ENDNOTE_EXPORT=enabled
```

### 步骤五：MCP客户端配置

#### 1. Cline (VS Code Extension) 配置
```json
{
  "mcpServers": {
    "pubmed-data-server": {
      "command": "node",
      "args": ["./src/index.js"],
      "cwd": "完整路径/to/mcp-pubmed-server",
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱地址",
        "ABSTRACT_MODE": "deep",
        "FULLTEXT_MODE": "enabled"
      }
    }
  }
}
```

**路径示例：**
- **Linux/macOS**: `/home/user/mcp-pubmed-server`
- **Windows**: `C:/Users/YourUser/mcp-pubmed-server`

#### 2. Cherry Studio (Windows) 配置
```json
{
  "mcpServers": {
    "VBFfGqCFz9AuZJXX2f5GL": {
      "name": "pubmed-data-server",
      "type": "stdio",
      "isActive": true,
      "command": "node",
      "args": [
        "Y:/software/mcp-pubmed-server/src/index.js"
      ],
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱地址",
        "ABSTRACT_MODE": "deep",
        "FULLTEXT_MODE": "enabled"
      }
    }
  }
}
```

**Windows 网络映射配置说明：**
- `Y:/` - Samba 网络驱动器映射路径
- 也可以使用本地路径如 `C:/mcp-pubmed-server/src/index.js`
- **注意**: Cherry Studio 不支持 `cwd` 参数

#### 3. Claude Desktop 配置
编辑 `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 或
`%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pubmed-data-server": {
      "command": "node",
      "args": ["/mnt/1T/software/mcp-pubmed-server/src/index.js"],
      "cwd": "/mnt/1T/software/mcp-pubmed-server",
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱地址",
        "ABSTRACT_MODE": "deep",
        "FULLTEXT_MODE": "enabled"
      }
    }
  }
}
```

**或使用项目内置模板：**
```bash
cp config/claude_desktop_config.json.example config/claude_desktop_config.json
# 编辑配置文件，填入API密钥
```

#### 4. Claude Code (CLI) 配置
编辑 `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "pubmed-data-server": {
      "command": "node",
      "args": ["/mnt/1T/software/mcp-pubmed-server/src/index.js"],
      "cwd": "/mnt/1T/software/mcp-pubmed-server",
      "env": {
        "PUBMED_API_KEY": "你的API密钥",
        "PUBMED_EMAIL": "你的邮箱地址",
        "ABSTRACT_MODE": "deep",
        "FULLTEXT_MODE": "enabled"
      }
    }
  }
}
```

### 步骤六：验证集成
在客户端中测试：`使用pubmed_search工具搜索"acupuncture"`

---

## 🛠️ 11个高效工具

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

### 6. `pubmed_detect_fulltext` - 检测全文可用性
```json
{
  "pmid": "38412345",
  "auto_download": false
}
```

### 7. `pubmed_download_fulltext` - 下载全文PDF
```json
{
  "pmid": "38412345",
  "force_download": false
}
```

### 8. `pubmed_fulltext_status` - 全文缓存管理
```json
{
  "action": "stats",
  "pmid": "38412345"
}
```

### 9. `pubmed_batch_download` - 批量智能下载
```json
{
  "pmids": ["38412345", "38412346", "38412347"],
  "human_like": true
}
```

### 10. `pubmed_system_check` - 系统环境检测
```json
{}
```

### 11. `pubmed_endnote_status` - EndNote导出管理
```json
{
  "action": "stats"
}
```

---

## 🏗️ 架构特色

### 📊 LLM优化输出
- **简洁格式**：标题、作者、期刊、日期
- **详细格式**：完整元数据+结构化摘要
- **LLM优化格式**：智能截断、关键点提取、关键词组织

### 🧠 上下文窗口管理
- 摘要截断模式（通过环境变量配置）：
  - QUICK 模式：1500 字符，快速检索，可能不包含完整摘要
  - DEEP 模式：6000 字符，深度检索；建议模型上下文窗口 ≥ 120k tokens（批量查询时更稳妥）
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

## 📚 详细文档

- **[全文模式与智能下载系统完整指南](docs/FULLTEXT_SMART_DOWNLOAD.md)** - 完整的全文模式和跨平台智能下载使用指南
- **[EndNote导出功能使用指南](docs/ENDNOTE_EXPORT.md)** - EndNote兼容格式自动导出功能
- **[配置说明文档](docs/CONFIGURATION.md)** - 环境变量和MCP客户端配置指南
- **[项目结构说明](.cursor/rules/README.md)** - Cursor规则和项目架构说明

---

**🎉 简单、高效、专注 - 现代MCP服务标准**

*版本 2.0 - 简化架构，专注数据提供*