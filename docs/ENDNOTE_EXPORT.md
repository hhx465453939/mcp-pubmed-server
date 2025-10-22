# EndNote导出功能使用指南

## 🎯 功能概述

EndNote导出功能是MCP PubMed服务器的核心特性，自动将搜索到的论文转换为EndNote兼容的格式，为研究人员提供一键导入文献管理工具的便利。

## 🚀 核心特性

### 1. 自动导出
- **默认开启**: 每次搜索自动导出论文
- **双格式支持**: 同时生成RIS和BibTeX格式
- **智能缓存**: 避免重复导出相同论文

### 2. 格式支持
- **RIS格式**: EndNote、Zotero、Mendeley等主流工具支持
- **BibTeX格式**: LaTeX、Overleaf等学术写作工具支持
- **标准兼容**: 遵循国际标准格式规范

### 3. 文件管理
- **自动命名**: 使用PMID作为文件名
- **索引管理**: 完整的导出记录和统计
- **清理机制**: 自动清理过期文件

## 🛠️ 使用方法

### 环境配置

在 `.env` 文件中配置：

```bash
# EndNote导出配置
ENDNOTE_EXPORT=enabled  # enabled, disabled
```

### 自动导出

每次使用 `pubmed_search` 搜索时，系统会自动导出论文：

```json
{
  "name": "pubmed_search",
  "arguments": {
    "query": "machine learning healthcare",
    "max_results": 10
  }
}
```

**返回结果包含导出信息**:
```json
{
  "success": true,
  "total": 150,
  "found": 10,
  "articles": [...],
  "endnote_export": {
    "success": true,
    "exported": 10,
    "failed": 0,
    "results": [...]
  }
}
```

### 手动管理

使用 `pubmed_endnote_status` 工具管理导出：

```json
{
  "name": "pubmed_endnote_status",
  "arguments": {
    "action": "stats"  // stats, list, clean, clear
  }
}
```

## 📁 文件结构

### 目录结构
```
cache/
├── papers/           # 论文元数据缓存
├── fulltext/         # 全文PDF缓存
├── endnote/          # EndNote导出文件
│   ├── index.json   # 导出索引
│   ├── 26000488.ris # RIS格式文件
│   ├── 26000488.bib # BibTeX格式文件
│   └── 26000487.ris
└── index.json       # 主索引文件
```

### 文件格式

#### RIS格式示例
```
TY  - JOUR
TI  - Machine Learning in Healthcare: A Systematic Review
AU  - Smith, John
AU  - Doe, Jane
T2  - Nature Medicine
PY  - 2024
VL  - 30
IS  - 3
SP  - 123-145
DO  - 10.1038/s41591-024-12345-6
PMID - 26000488
AB  - This systematic review examines the applications of machine learning...
KW  - machine learning
KW  - healthcare
KW  - artificial intelligence
LA  - eng
DB  - PubMed
ER  - 
```

#### BibTeX格式示例
```
@article{smith202426000488,
  title = {Machine Learning in Healthcare: A Systematic Review},
  author = {Smith, John and Doe, Jane},
  journal = {Nature Medicine},
  year = {2024},
  volume = {30},
  number = {3},
  pages = {123-145},
  doi = {10.1038/s41591-024-12345-6},
  pmid = {26000488},
  abstract = {This systematic review examines the applications of machine learning...},
  publisher = {PubMed},
  url = {https://pubmed.ncbi.nlm.nih.gov/26000488/},
}
```

## 📊 使用示例

### 示例1: 查看导出状态
```json
{
  "name": "pubmed_endnote_status",
  "arguments": {
    "action": "stats"
  }
}
```

**返回结果**:
```json
{
  "success": true,
  "action": "stats",
  "endnote_export": {
    "enabled": true,
    "directory": "/path/to/cache/endnote",
    "totalExports": 25,
    "risFiles": 25,
    "bibtexFiles": 25,
    "lastExport": "2024-01-15T10:30:00.000Z",
    "supportedFormats": ["ris", "bibtex"]
  }
}
```

### 示例2: 列出导出的论文
```json
{
  "name": "pubmed_endnote_status",
  "arguments": {
    "action": "list"
  }
}
```

**返回结果**:
```json
{
  "success": true,
  "action": "list",
  "exported_papers": [
    {
      "pmid": "26000488",
      "title": "Machine Learning in Healthcare",
      "formats": {
        "ris": {
          "success": true,
          "filePath": "/path/to/cache/endnote/26000488.ris"
        },
        "bibtex": {
          "success": true,
          "filePath": "/path/to/cache/endnote/26000488.bib"
        }
      },
      "exported": "2024-01-15T10:30:00.000Z"
    }
  ],
  "total": 25
}
```

### 示例3: 清理过期文件
```json
{
  "name": "pubmed_endnote_status",
  "arguments": {
    "action": "clean"
  }
}
```

**返回结果**:
```json
{
  "success": true,
  "action": "clean",
  "message": "Cleaned 5 expired EndNote export files"
}
```

## 🔧 技术实现

### 导出流程
```
搜索论文 → 提取元数据 → 生成RIS格式 → 生成BibTeX格式 → 保存文件 → 更新索引
```

### 元数据提取
- **标题**: 论文标题
- **作者**: 作者列表
- **期刊**: 期刊名称
- **日期**: 发表日期
- **卷期**: 卷号、期号、页码
- **标识符**: DOI、PMID、PMC ID
- **摘要**: 论文摘要
- **关键词**: 关键词列表

### 格式生成
- **RIS格式**: 遵循RIS标准，包含所有必要字段
- **BibTeX格式**: 生成标准BibTeX条目，支持LaTeX引用
- **文件命名**: 使用PMID确保唯一性

## ⚡ 性能优化

### 缓存策略
- **智能缓存**: 避免重复导出相同论文
- **增量更新**: 只导出新搜索的论文
- **索引管理**: 实时更新导出统计

### 文件管理
- **自动清理**: 30天过期文件自动清理
- **存储优化**: 最小化文件大小
- **错误处理**: 完善的异常处理机制

## 🔍 故障排除

### 常见问题

1. **"EndNote export is disabled"**
   - 检查 `ENDNOTE_EXPORT` 环境变量
   - 确保设置为 `enabled`

2. **"Export failed"**
   - 检查缓存目录权限
   - 确认磁盘空间充足

3. **"File not found"**
   - 检查文件是否被意外删除
   - 重新搜索论文触发导出

4. **"Format error"**
   - 检查元数据完整性
   - 查看详细错误日志

### 调试模式
```bash
# 启用详细日志
NODE_ENV=development node src/index.js

# 检查导出状态
# 使用 pubmed_endnote_status 工具
```

## 📈 使用场景

### 1. 学术研究
- 自动建立文献库
- 支持多种文献管理工具
- 便于引用和写作

### 2. 文献综述
- 批量导入相关文献
- 统一格式管理
- 支持协作研究

### 3. 论文写作
- 直接导入LaTeX项目
- 支持Overleaf等在线工具
- 自动生成参考文献

## 🎯 最佳实践

### 1. 环境配置
```bash
# 推荐配置
ENDNOTE_EXPORT=enabled
FULLTEXT_MODE=enabled
```

### 2. 文件管理
- 定期清理过期文件
- 备份重要导出文件
- 监控存储空间使用

### 3. 工具集成
- 使用EndNote导入RIS文件
- 使用Zotero导入RIS文件
- 使用LaTeX导入BibTeX文件

## 🔒 注意事项

### 版权合规
- 仅导出公开可用的元数据
- 不包含受版权保护的内容
- 遵守学术使用规范

### 数据安全
- 本地存储，保护隐私
- 定期备份重要文件
- 注意文件访问权限

### 格式兼容
- RIS格式兼容性最好
- BibTeX适合LaTeX用户
- 支持主流文献管理工具

## 🚀 未来改进

### 计划功能
- **批量导出**: 支持批量下载所有导出文件
- **格式转换**: 支持更多导出格式
- **云端同步**: 支持云存储同步

### 性能优化
- **并行处理**: 多线程导出支持
- **压缩存储**: 文件压缩减少存储空间
- **智能去重**: 自动识别重复论文

---

**🎉 EndNote导出功能让文献管理更加高效！**

通过自动导出RIS和BibTeX格式，您可以轻松将PubMed搜索结果导入到任何文献管理工具中，大大提升研究效率。
