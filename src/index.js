#!/usr/bin/env node
import 'dotenv/config';

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import fs from 'fs';
import path from 'path';

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const RATE_LIMIT_DELAY = 334; // PubMed rate limit: 3 requests per second
const REQUEST_TIMEOUT = 30000; // 30秒请求超时

// 缓存配置
const CACHE_DIR = path.join(process.cwd(), 'cache');
const PAPER_CACHE_DIR = path.join(CACHE_DIR, 'papers');
const CACHE_VERSION = '1.0';
const PAPER_CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30天过期

// Abstract truncation modes (env-driven)
const ABSTRACT_MODE = (process.env.ABSTRACT_MODE || 'quick').toLowerCase() === 'deep' ? 'deep' : 'quick';
const ABSTRACT_MAX_CHARS = ABSTRACT_MODE === 'deep' ? 6000 : 1500;
const ABSTRACT_MODE_NOTE = ABSTRACT_MODE === 'deep'
    ? 'Deep mode: up to 6000 chars per abstract. Requires large model context (>=120k tokens recommended for batch usage).'
    : 'Quick mode: up to 1500 chars per abstract (may be incomplete). Optimized for fast retrieval.';

class PubMedDataServer {
    constructor() {
        this.server = new Server(
            {
                name: "pubmed-data-server",
                version: "2.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupRequestHandlers();
        this.lastRequestTime = 0;
        this.cache = new Map(); // 简单的内存缓存
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存过期
        this.maxCacheSize = 100; // 最大缓存条目数
        this.cacheStats = {
            hits: 0,
            misses: 0,
            sets: 0,
            evictions: 0,
            fileHits: 0,
            fileMisses: 0,
            fileSets: 0
        };
        
        // 初始化缓存目录
        this.initCacheDirectories();
    }

    // 初始化缓存目录
    initCacheDirectories() {
        try {
            if (!fs.existsSync(CACHE_DIR)) {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
                console.error(`[Cache] Created cache directory: ${CACHE_DIR}`);
            }
            
            if (!fs.existsSync(PAPER_CACHE_DIR)) {
                fs.mkdirSync(PAPER_CACHE_DIR, { recursive: true });
                console.error(`[Cache] Created paper cache directory: ${PAPER_CACHE_DIR}`);
            }
            
            // 创建缓存索引文件
            const indexPath = path.join(CACHE_DIR, 'index.json');
            if (!fs.existsSync(indexPath)) {
                const indexData = {
                    version: CACHE_VERSION,
                    created: new Date().toISOString(),
                    papers: {},
                    stats: {
                        totalPapers: 0,
                        lastCleanup: new Date().toISOString()
                    }
                };
                fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
                console.error(`[Cache] Created cache index: ${indexPath}`);
            }
        } catch (error) {
            console.error(`[Cache] Error initializing cache directories:`, error.message);
        }
    }

    // 论文文件缓存管理
    getPaperCachePath(pmid) {
        return path.join(PAPER_CACHE_DIR, `${pmid}.json`);
    }

    getPaperFromFileCache(pmid) {
        try {
            const cachePath = this.getPaperCachePath(pmid);
            if (!fs.existsSync(cachePath)) {
                this.cacheStats.fileMisses++;
                return null;
            }

            const fileContent = fs.readFileSync(cachePath, 'utf8');
            const cachedData = JSON.parse(fileContent);
            
            // 检查过期时间
            if (Date.now() - cachedData.timestamp > PAPER_CACHE_EXPIRY) {
                fs.unlinkSync(cachePath); // 删除过期文件
                this.cacheStats.fileMisses++;
                console.error(`[Cache] Expired paper cache deleted: ${pmid}`);
                return null;
            }

            this.cacheStats.fileHits++;
            console.error(`[Cache] File cache hit for PMID: ${pmid}`);
            return cachedData.data;
        } catch (error) {
            console.error(`[Cache] Error reading paper cache for ${pmid}:`, error.message);
            this.cacheStats.fileMisses++;
            return null;
        }
    }

    setPaperToFileCache(pmid, data) {
        try {
            const cachePath = this.getPaperCachePath(pmid);
            const cacheData = {
                version: CACHE_VERSION,
                pmid: pmid,
                timestamp: Date.now(),
                data: data
            };
            
            fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
            this.cacheStats.fileSets++;
            console.error(`[Cache] Paper cached to file: ${pmid}`);
            
            // 更新索引
            this.updateCacheIndex(pmid, true);
        } catch (error) {
            console.error(`[Cache] Error writing paper cache for ${pmid}:`, error.message);
        }
    }

    // 更新缓存索引
    updateCacheIndex(pmid, added = true) {
        try {
            const indexPath = path.join(CACHE_DIR, 'index.json');
            const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            
            if (added) {
                indexData.papers[pmid] = {
                    cached: new Date().toISOString(),
                    file: `${pmid}.json`
                };
                indexData.stats.totalPapers = Object.keys(indexData.papers).length;
            } else {
                delete indexData.papers[pmid];
                indexData.stats.totalPapers = Object.keys(indexData.papers).length;
            }
            
            fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
        } catch (error) {
            console.error(`[Cache] Error updating cache index:`, error.message);
        }
    }

    // 清理过期的论文缓存文件
    cleanExpiredPaperCache() {
        try {
            const indexPath = path.join(CACHE_DIR, 'index.json');
            if (!fs.existsSync(indexPath)) return 0;
            
            const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            let cleaned = 0;
            
            for (const [pmid, info] of Object.entries(indexData.papers)) {
                const cachePath = this.getPaperCachePath(pmid);
                if (fs.existsSync(cachePath)) {
                    const fileContent = fs.readFileSync(cachePath, 'utf8');
                    const cachedData = JSON.parse(fileContent);
                    
                    if (Date.now() - cachedData.timestamp > PAPER_CACHE_EXPIRY) {
                        fs.unlinkSync(cachePath);
                        delete indexData.papers[pmid];
                        cleaned++;
                    }
                } else {
                    // 文件不存在，从索引中删除
                    delete indexData.papers[pmid];
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                indexData.stats.totalPapers = Object.keys(indexData.papers).length;
                indexData.stats.lastCleanup = new Date().toISOString();
                fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
                console.error(`[Cache] Cleaned ${cleaned} expired paper cache files`);
            }
            
            return cleaned;
        } catch (error) {
            console.error(`[Cache] Error cleaning expired paper cache:`, error.message);
            return 0;
        }
    }

    setupRequestHandlers() {
        // 列出可用工具
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "pubmed_search",
                        description: "搜索PubMed文献并返回结构化数据，供LLM进一步分析",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "搜索查询，支持布尔逻辑和MeSH术语"
                                },
                                max_results: {
                                    type: "number",
                                    description: "最大返回结果数量 (1-100)",
                                    default: 20,
                                    minimum: 1,
                                    maximum: 100
                                },
                                page_size: {
                                    type: "number",
                                    description: "分页大小，用于控制单次返回的文章数量",
                                    default: 20,
                                    minimum: 5,
                                    maximum: 50
                                },
                                days_back: {
                                    type: "number",
                                    description: "搜索最近N天的文献，0表示不限制",
                                    default: 0,
                                    minimum: 0
                                },
                                include_abstract: {
                                    type: "boolean",
                                    description: "是否包含摘要内容",
                                    default: true
                                },
                                sort_by: {
                                    type: "string",
                                    description: "排序方式: relevance, date, pubdate",
                                    default: "relevance",
                                    enum: ["relevance", "date", "pubdate"]
                                },
                                response_format: {
                                    type: "string",
                                    description: "响应格式: compact, standard, detailed",
                                    default: "standard",
                                    enum: ["compact", "standard", "detailed"]
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "pubmed_quick_search",
                        description: "快速搜索PubMed文献，返回精简结果，优化响应速度",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "搜索查询"
                                },
                                max_results: {
                                    type: "number",
                                    description: "最大返回结果数量 (1-20)",
                                    default: 10,
                                    minimum: 1,
                                    maximum: 20
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "pubmed_cache_info",
                        description: "获取缓存统计信息和状态，支持内存和文件缓存管理",
                        inputSchema: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    description: "缓存操作",
                                    enum: ["stats", "clear", "clean", "clean_files", "clear_files"],
                                    default: "stats"
                                }
                            }
                        }
                    },
                    {
                        name: "pubmed_get_details",
                        description: "获取指定PMID的完整文献信息，包括全文摘要和详细元数据",
                        inputSchema: {
                            type: "object",
                            properties: {
                                pmids: {
                                    oneOf: [
                                        { type: "string" },
                                        {
                                            type: "array",
                                            items: { type: "string" }
                                        }
                                    ],
                                    description: "PMID或PMID列表"
                                },
                                include_full_text: {
                                    type: "boolean",
                                    description: "尝试获取全文链接",
                                    default: false
                                }
                            },
                            required: ["pmids"]
                        }
                    },
                    {
                        name: "pubmed_extract_key_info",
                        description: "提取文献关键信息，优化LLM理解和处理",
                        inputSchema: {
                            type: "object",
                            properties: {
                                pmid: {
                                    type: "string",
                                    description: "PubMed文献ID"
                                },
                                extract_sections: {
                                    type: "array",
                                    description: "要提取的信息部分",
                                    items: {
                                        type: "string",
                                        enum: [
                                            "basic_info",        // 基本信息
                                            "authors",           // 作者信息
                                            "abstract_summary",  // 摘要总结
                                            "keywords",          // 关键词
                                            "methods",           // 方法部分
                                            "results",           // 结果部分
                                            "conclusions",       // 结论部分
                                            "references",        // 参考文献
                                            "doi_link"          // DOI链接
                                        ]
                                    },
                                    default: ["basic_info", "abstract_summary", "authors"]
                                },
                                max_abstract_length: {
                                    type: "number",
                                    description: "摘要最大长度（字符）",
                                    default: 5000,
                                    minimum: 500,
                                    maximum: 6000
                                }
                            },
                            required: ["pmid"]
                        }
                    },
                    {
                        name: "pubmed_cross_reference",
                        description: "交叉引用相关文献，用于事实核查和深度分析",
                        inputSchema: {
                            type: "object",
                            properties: {
                                pmid: {
                                    type: "string",
                                    description: "基础文献PMID"
                                },
                                reference_type: {
                                    type: "string",
                                    description: "引用类型",
                                    enum: [
                                        "citing",      // 引用本文的文献
                                        "cited",       // 本文引用的文献
                                        "similar",     // 相似文献
                                        "reviews"      // 相关综述
                                    ],
                                    default: "similar"
                                },
                                max_results: {
                                    type: "number",
                                    description: "最大结果数",
                                    default: 10,
                                    minimum: 1,
                                    maximum: 50
                                }
                            },
                            required: ["pmid"]
                        }
                    },
                    {
                        name: "pubmed_batch_query",
                        description: "批量查询多个PMID的详细信息，优化上下文窗口使用",
                        inputSchema: {
                            type: "object",
                            properties: {
                                pmids: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "PMID列表 (最多20个)",
                                    maxItems: 20
                                },
                                query_format: {
                                    type: "string",
                                    description: "输出格式优化",
                                    enum: [
                                        "concise",     // 简洁格式
                                        "detailed",    // 详细格式
                                        "llm_optimized" // LLM优化格式
                                    ],
                                    default: "llm_optimized"
                                },
                                include_abstracts: {
                                    type: "boolean",
                                    description: "是否包含摘要",
                                    default: true
                                }
                            },
                            required: ["pmids"]
                        }
                    }
                ]
            };
        });

        // 处理工具调用
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "pubmed_search":
                        return await this.handleSearch(args);
                    case "pubmed_quick_search":
                        return await this.handleQuickSearch(args);
                    case "pubmed_cache_info":
                        return await this.handleCacheInfo(args);
                    case "pubmed_get_details":
                        return await this.handleGetDetails(args);
                    case "pubmed_extract_key_info":
                        return await this.handleExtractKeyInfo(args);
                    case "pubmed_cross_reference":
                        return await this.handleCrossReference(args);
                    case "pubmed_batch_query":
                        return await this.handleBatchQuery(args);
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                console.error(`Error handling ${name}:`, error);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error.message}`
                        }
                    ]
                };
            }
        });
    }

    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();
    }

    // 缓存管理
    getCacheKey(query, maxResults, daysBack, sortBy) {
        return `${query}|${maxResults}|${daysBack}|${sortBy}`;
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            this.cacheStats.hits++;
            console.error(`[Cache] Hit for key: ${key.substring(0, 50)}... (hits: ${this.cacheStats.hits})`);
            return cached.data;
        }
        if (cached) {
            this.cache.delete(key);
        }
        this.cacheStats.misses++;
        return null;
    }

    setCache(key, data) {
        // 检查缓存大小限制
        if (this.cache.size >= this.maxCacheSize) {
            // LRU淘汰：删除最旧的条目
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this.cacheStats.evictions++;
            console.error(`[Cache] Evicted oldest entry: ${oldestKey.substring(0, 30)}...`);
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        this.cacheStats.sets++;
        console.error(`[Cache] Set for key: ${key.substring(0, 50)}... (size: ${this.cache.size}/${this.maxCacheSize})`);
    }

    // 缓存统计信息
    getCacheStats() {
        const memoryHitRate = this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100;
        const fileHitRate = this.cacheStats.fileHits / (this.cacheStats.fileHits + this.cacheStats.fileMisses) * 100;
        
        // 获取文件缓存统计
        let fileCacheStats = { totalPapers: 0, cacheDir: PAPER_CACHE_DIR };
        try {
            const indexPath = path.join(CACHE_DIR, 'index.json');
            if (fs.existsSync(indexPath)) {
                const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                fileCacheStats = {
                    totalPapers: indexData.stats.totalPapers,
                    cacheDir: PAPER_CACHE_DIR,
                    lastCleanup: indexData.stats.lastCleanup,
                    version: indexData.version
                };
            }
        } catch (error) {
            console.error(`[Cache] Error reading file cache stats:`, error.message);
        }
        
        return {
            memory: {
                hits: this.cacheStats.hits,
                misses: this.cacheStats.misses,
                sets: this.cacheStats.sets,
                evictions: this.cacheStats.evictions,
                hitRate: memoryHitRate.toFixed(2) + '%',
                currentSize: this.cache.size,
                maxSize: this.maxCacheSize,
                timeoutMinutes: this.cacheTimeout / (60 * 1000)
            },
            file: {
                hits: this.cacheStats.fileHits,
                misses: this.cacheStats.fileMisses,
                sets: this.cacheStats.fileSets,
                hitRate: fileHitRate.toFixed(2) + '%',
                ...fileCacheStats,
                expiryDays: PAPER_CACHE_EXPIRY / (24 * 60 * 60 * 1000)
            }
        };
    }

    // 清理过期缓存
    cleanExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp >= this.cacheTimeout) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.error(`[Cache] Cleaned ${cleaned} expired entries`);
        }
        return cleaned;
    }

    async searchPubMed(query, maxResults = 20, daysBack = 0, sortBy = "relevance") {
        // 检查缓存
        const cacheKey = this.getCacheKey(query, maxResults, daysBack, sortBy);
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        await this.enforceRateLimit();

        // 构建搜索查询
        let searchQuery = query;
        if (daysBack > 0) {
            const date = new Date();
            date.setDate(date.getDate() - daysBack);
            const dateStr = date.toISOString().split('T')[0];
            searchQuery += ` AND ("${dateStr}"[Date - Publication] : "3000"[Date - Publication])`;
        }

        // 添加排序参数
        const sortMap = {
            "relevance": "relevance",
            "date": "pub+date",
            "pubdate": "pub+date"
        };

        const searchUrl = new URL(`${PUBMED_BASE_URL}/esearch.fcgi`);
        searchUrl.searchParams.append('db', 'pubmed');
        searchUrl.searchParams.append('term', searchQuery);
        searchUrl.searchParams.append('retmax', maxResults.toString());
        searchUrl.searchParams.append('retmode', 'json');
        searchUrl.searchParams.append('sort', sortMap[sortBy] || 'relevance');
        searchUrl.searchParams.append('tool', 'mcp-pubmed-server');
        searchUrl.searchParams.append('email', process.env.PUBMED_EMAIL || 'user@example.com');

        if (process.env.PUBMED_API_KEY) {
            searchUrl.searchParams.append('api_key', process.env.PUBMED_API_KEY);
        }

        const response = await fetch(searchUrl.toString(), {
            timeout: REQUEST_TIMEOUT
        });
        if (!response.ok) {
            throw new Error(`PubMed search failed: ${response.statusText}`);
        }

        const data = await response.json();
        const ids = data.esearchresult?.idlist || [];

        if (ids.length === 0) {
            return { articles: [], total: 0, query: searchQuery };
        }

        const articles = await this.fetchArticleDetails(ids);
        const result = { articles, total: data.esearchresult?.count || 0, query: searchQuery };
        
        // 缓存结果
        this.setCache(cacheKey, result);
        
        return result;
    }

    async fetchArticleDetails(ids) {
        const articles = [];
        const uncachedIds = [];
        
        // 首先检查文件缓存
        for (const id of ids) {
            const cachedArticle = this.getPaperFromFileCache(id);
            if (cachedArticle) {
                articles.push(cachedArticle);
            } else {
                uncachedIds.push(id);
            }
        }
        
        // 如果有未缓存的文章，从PubMed获取
        if (uncachedIds.length > 0) {
            console.error(`[Cache] Fetching ${uncachedIds.length} uncached articles from PubMed`);
            const newArticles = await this.fetchFromPubMed(uncachedIds);
            
            // 将新获取的文章保存到文件缓存
            for (const article of newArticles) {
                this.setPaperToFileCache(article.pmid, article);
            }
            
            articles.push(...newArticles);
        }
        
        // 按原始ID顺序排序
        return ids.map(id => articles.find(article => article.pmid === id));
    }

    async fetchFromPubMed(ids) {
        await this.enforceRateLimit();

        const summaryUrl = new URL(`${PUBMED_BASE_URL}/esummary.fcgi`);
        summaryUrl.searchParams.append('db', 'pubmed');
        summaryUrl.searchParams.append('id', ids.join(','));
        summaryUrl.searchParams.append('retmode', 'json');
        summaryUrl.searchParams.append('tool', 'mcp-pubmed-server');
        summaryUrl.searchParams.append('email', process.env.PUBMED_EMAIL || 'user@example.com');

        if (process.env.PUBMED_API_KEY) {
            summaryUrl.searchParams.append('api_key', process.env.PUBMED_API_KEY);
        }

        const response = await fetch(summaryUrl.toString(), {
            timeout: REQUEST_TIMEOUT
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch article details: ${response.statusText}`);
        }

        const data = await response.json();

        const articles = ids.map(id => {
            const article = data.result[id];
            return {
                pmid: id,
                title: article.title || 'No title',
                authors: article.authors?.map(author => author.name) || [],
                journal: article.source || 'No journal',
                publicationDate: article.pubdate || 'No date',
                volume: article.volume || '',
                issue: article.issue || '',
                pages: article.pages || '',
                abstract: article.abstract || null, // esummary 可能有截断的摘要
                doi: article.elocationid || '',
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                publicationTypes: article.pubtype || [],
                meshTerms: article.meshterms || [],
                keywords: article.keywords || []
            };
        });

        // 如果是 deep 模式，尝试获取完整摘要
        if (ABSTRACT_MODE === 'deep') {
            for (let article of articles) {
                try {
                    // 只有当 esummary 没有摘要或摘要很短时才获取完整摘要
                    if (!article.abstract || article.abstract.length < 1000) {
                        article.abstract = await this.fetchFullAbstract(article.pmid);
                    }
                } catch (error) {
                    console.warn(`Failed to fetch full abstract for ${article.pmid}:`, error.message);
                    // 保留原有的摘要（即使可能不完整）
                }
            }
        }

        return articles;
    }

    async fetchFullAbstract(pmid) {
        await this.enforceRateLimit();

        const abstractUrl = new URL(`${PUBMED_BASE_URL}/efetch.fcgi`);
        abstractUrl.searchParams.append('db', 'pubmed');
        abstractUrl.searchParams.append('id', pmid);
        abstractUrl.searchParams.append('rettype', 'abstract');
        abstractUrl.searchParams.append('retmode', 'text');
        abstractUrl.searchParams.append('tool', 'mcp-pubmed-server');
        abstractUrl.searchParams.append('email', process.env.PUBMED_EMAIL || 'user@example.com');

        if (process.env.PUBMED_API_KEY) {
            abstractUrl.searchParams.append('api_key', process.env.PUBMED_API_KEY);
        }

        const response = await fetch(abstractUrl.toString(), {
            timeout: REQUEST_TIMEOUT
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch abstract: ${response.statusText}`);
        }

        return await response.text();
    }

    // 格式化文献信息为LLM友好格式
    formatForLLM(articles, format = "llm_optimized", responseFormat = "standard") {
        if (format === "concise") {
            return articles.map(article => ({
                pmid: article.pmid,
                title: article.title,
                authors: article.authors.slice(0, 3).join(', ') + (article.authors.length > 3 ? ' et al.' : ''),
                journal: article.journal,
                date: article.publicationDate,
                url: article.url
            }));
        }

        if (format === "detailed") {
            return articles.map(article => ({
                ...article,
                structuredAbstract: article.abstract ? this.extractAbstractSections(article.abstract) : null
            }));
        }

        // 根据响应格式选择不同的优化策略
        if (responseFormat === "compact") {
            return articles.map(article => ({
                pmid: article.pmid,
                title: article.title,
                authors: article.authors.slice(0, 2).join(', ') + (article.authors.length > 2 ? ' et al.' : ''),
                journal: article.journal,
                date: article.publicationDate,
                url: article.url,
                abstract: article.abstract ? this.truncateText(article.abstract, 500) : null
            }));
        }

        if (responseFormat === "detailed") {
            return articles.map(article => {
                const structured = {
                    identifier: `PMID: ${article.pmid}`,
                    title: article.title,
                    citation: `${article.authors.slice(0, 3).join(', ')}${article.authors.length > 3 ? ' et al.' : ''} ${article.journal}, ${article.publicationDate}`,
                    url: article.url,
                    volume: article.volume,
                    issue: article.issue,
                    pages: article.pages,
                    doi: article.doi
                };

                if (article.abstract) {
                    structured.abstract = this.truncateText(article.abstract, ABSTRACT_MAX_CHARS);
                    structured.key_points = this.extractKeyPoints(article.abstract);
                    structured.structured_sections = this.extractAbstractSections(article.abstract);
                }

                if (article.meshTerms && article.meshTerms.length > 0) {
                    structured.keywords = article.meshTerms.slice(0, 15);
                }

                return structured;
            });
        }

        // 标准格式 (默认)
        return articles.map(article => {
            const structured = {
                pmid: article.pmid,
                title: article.title,
                citation: `${article.authors.slice(0, 3).join(', ')}${article.authors.length > 3 ? ' et al.' : ''} ${article.journal}, ${article.publicationDate}`,
                url: article.url
            };

            if (article.abstract) {
                structured.abstract = this.truncateText(article.abstract, ABSTRACT_MAX_CHARS);
                structured.key_points = this.extractKeyPoints(article.abstract);
            }

            if (article.meshTerms && article.meshTerms.length > 0) {
                structured.keywords = article.meshTerms.slice(0, 8);
            }

            return structured;
        });
    }

    extractAbstractSections(abstract) {
        // 尝试提取摘要的结构化部分
        const sections = {};

        const sectionPatterns = [
            { name: "background", regex: /(?:BACKGROUND|BACKGROUND:|Introduction)/i },
            { name: "methods", regex: /(?:METHODS|METHODS:|Methodology)/i },
            { name: "results", regex: /(?:RESULTS|RESULTS:|Findings)/i },
            { name: "conclusions", regex: /(?:CONCLUSIONS|CONCLUSIONS:|Conclusion)/i }
        ];

        sectionPatterns.forEach(section => {
            const match = abstract.match(new RegExp(`${section.regex}(.+?)(?=${sectionPatterns.map(s => s.regex).join('|')}|$)`, 'is'));
            if (match) {
                sections[section.name] = match[1].trim();
            }
        });

        return Object.keys(sections).length > 0 ? sections : { full: abstract };
    }

    extractKeyPoints(abstract) {
        // 提取关键点（简单实现，可以进一步优化）
        const sentences = abstract.split(/[.!?]+/).filter(s => s.trim().length > 20);
        return sentences.slice(0, 5).map(s => s.trim());
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + "...";
    }

    // 工具处理方法
    async handleSearch(args) {
        const { query, max_results = 20, page_size = 20, days_back = 0, include_abstract = true, sort_by = "relevance", response_format = "standard" } = args;
        
        // 智能调整结果数量
        const effectiveMaxResults = Math.min(max_results, page_size);
        const isLargeQuery = max_results > 50;
        
        console.error(`[PubMed Search] Starting search for: "${query}" (max_results=${max_results}, page_size=${page_size}, effective=${effectiveMaxResults})`);
        const startTime = Date.now();

        try {
            const result = await this.searchPubMed(query, effectiveMaxResults, days_back, sort_by);
            const endTime = Date.now();
            console.error(`[PubMed Search] Completed in ${endTime - startTime}ms, found ${result.articles.length} articles`);

            if (result.articles.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                total: 0,
                                query: result.query,
                                message: "未找到匹配的文献",
                                articles: []
                            }, null, 2)
                        }
                    ]
                };
            }

            // 格式化为LLM友好的输出
            const formattedArticles = this.formatForLLM(result.articles, "llm_optimized", response_format);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            total: result.total,
                            query: result.query,
                            found: result.articles.length,
                            articles: formattedArticles,
                            search_metadata: {
                                max_results: max_results,
                                page_size: page_size,
                                effective_results: effectiveMaxResults,
                                days_back: days_back,
                                sort_by: sort_by,
                                include_abstract: include_abstract,
                                response_format: response_format,
                                is_large_query: isLargeQuery,
                                performance_note: isLargeQuery ? "Large query detected. Consider using page_size parameter for better performance." : null
                            }
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            const endTime = Date.now();
            console.error(`[PubMed Search] Error after ${endTime - startTime}ms:`, error.message);
            throw error;
        }
    }

    async handleQuickSearch(args) {
        const { query, max_results = 10 } = args;
        
        console.error(`[Quick Search] Starting quick search for: "${query}" (max_results=${max_results})`);
        const startTime = Date.now();

        try {
            const result = await this.searchPubMed(query, max_results, 0, "relevance");
            const endTime = Date.now();
            console.error(`[Quick Search] Completed in ${endTime - startTime}ms, found ${result.articles.length} articles`);

            if (result.articles.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                total: 0,
                                query: result.query,
                                message: "未找到匹配的文献",
                                articles: []
                            }, null, 2)
                        }
                    ]
                };
            }

            // 使用最精简的格式
            const formattedArticles = this.formatForLLM(result.articles, "llm_optimized", "compact");

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            success: true,
                            total: result.total,
                            query: result.query,
                            found: result.articles.length,
                            articles: formattedArticles,
                            search_metadata: {
                                max_results: max_results,
                                response_format: "compact",
                                search_type: "quick"
                            }
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            const endTime = Date.now();
            console.error(`[Quick Search] Error after ${endTime - startTime}ms:`, error.message);
            throw error;
        }
    }

    async handleCacheInfo(args) {
        const { action = "stats" } = args;
        
        switch (action) {
            case "stats":
                const stats = this.getCacheStats();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                cache_stats: stats,
                                cache_info: {
                                    memory: {
                                        location: "内存 (Node.js进程)",
                                        type: "Map对象",
                                        persistence: "临时 (服务器重启后丢失)",
                                        eviction_policy: "LRU (最近最少使用)"
                                    },
                                    file: {
                                        location: PAPER_CACHE_DIR,
                                        type: "JSON文件",
                                        persistence: "持久化 (服务器重启后保留)",
                                        expiry_policy: `${PAPER_CACHE_EXPIRY / (24 * 60 * 60 * 1000)}天自动过期`
                                    }
                                }
                            }, null, 2)
                        }
                    ]
                };
                
            case "clear":
                const beforeSize = this.cache.size;
                this.cache.clear();
                this.cacheStats = { hits: 0, misses: 0, sets: 0, evictions: 0, fileHits: 0, fileMisses: 0, fileSets: 0 };
                console.error(`[Cache] Cleared all ${beforeSize} memory entries`);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message: `已清空内存缓存，删除了 ${beforeSize} 个条目`,
                                cache_stats: this.getCacheStats()
                            }, null, 2)
                        }
                    ]
                };
                
            case "clean":
                const cleaned = this.cleanExpiredCache();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message: `已清理过期内存缓存，删除了 ${cleaned} 个条目`,
                                cache_stats: this.getCacheStats()
                            }, null, 2)
                        }
                    ]
                };
                
            case "clean_files":
                const cleanedFiles = this.cleanExpiredPaperCache();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message: `已清理过期文件缓存，删除了 ${cleanedFiles} 个文件`,
                                cache_stats: this.getCacheStats()
                            }, null, 2)
                        }
                    ]
                };
                
            case "clear_files":
                try {
                    let deletedCount = 0;
                    if (fs.existsSync(PAPER_CACHE_DIR)) {
                        const files = fs.readdirSync(PAPER_CACHE_DIR);
                        for (const file of files) {
                            if (file.endsWith('.json')) {
                                fs.unlinkSync(path.join(PAPER_CACHE_DIR, file));
                                deletedCount++;
                            }
                        }
                    }
                    
                    // 重置索引
                    const indexPath = path.join(CACHE_DIR, 'index.json');
                    const indexData = {
                        version: CACHE_VERSION,
                        created: new Date().toISOString(),
                        papers: {},
                        stats: {
                            totalPapers: 0,
                            lastCleanup: new Date().toISOString()
                        }
                    };
                    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
                    
                    console.error(`[Cache] Cleared all ${deletedCount} file cache entries`);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    success: true,
                                    message: `已清空文件缓存，删除了 ${deletedCount} 个文件`,
                                    cache_stats: this.getCacheStats()
                                }, null, 2)
                            }
                        ]
                    };
                } catch (error) {
                    throw new Error(`Error clearing file cache: ${error.message}`);
                }
                
            default:
                throw new Error(`Unknown cache action: ${action}`);
        }
    }

    async handleGetDetails(args) {
        const { pmids, include_full_text = false } = args;

        const pmidList = Array.isArray(pmids) ? pmids : [pmids];

        if (pmidList.length > 20) {
            throw new Error("一次最多查询20个PMID，请使用批量查询工具");
        }

        const articles = await this.fetchArticleDetails(pmidList);

        // 获取完整摘要
        if (include_full_text) {
            for (let article of articles) {
                try {
                    article.fullAbstract = await this.fetchFullAbstract(article.pmid);
                } catch (error) {
                    console.warn(`Failed to fetch full abstract for ${article.pmid}:`, error.message);
                }
            }
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        articles: articles,
                        metadata: {
                            count: articles.length,
                            include_full_text: include_full_text
                        }
                    }, null, 2)
                }
            ]
        };
    }

    async handleExtractKeyInfo(args) {
        const { pmid, extract_sections = ["basic_info", "abstract_summary", "authors"], max_abstract_length = ABSTRACT_MAX_CHARS } = args;

        const articles = await this.fetchArticleDetails([pmid]);

        if (articles.length === 0) {
            throw new Error(`未找到PMID为 ${pmid} 的文献`);
        }

        const article = articles[0];
        const extracted = {};

        // 基本信息
        if (extract_sections.includes("basic_info")) {
            extracted.basic_info = {
                pmid: article.pmid,
                title: article.title,
                journal: article.journal,
                publicationDate: article.publicationDate,
                volume: article.volume,
                issue: article.issue,
                pages: article.pages,
                doi: article.doi,
                url: article.url,
                publicationTypes: article.publicationTypes
            };
        }

        // 作者信息
        if (extract_sections.includes("authors")) {
            extracted.authors = {
                full_list: article.authors,
                first_author: article.authors[0] || null,
                last_author: article.authors[article.authors.length - 1] || null,
                author_count: article.authors.length
            };
        }

        // 摘要总结
        if (extract_sections.includes("abstract_summary") && article.abstract) {
            const truncatedAbstract = this.truncateText(article.abstract, max_abstract_length);
            extracted.abstract_summary = {
                full: truncatedAbstract,
                structured: this.extractAbstractSections(truncatedAbstract),
                key_points: this.extractKeyPoints(truncatedAbstract),
                word_count: truncatedAbstract.split(/\s+/).length
            };
        }

        // 关键词
        if (extract_sections.includes("keywords")) {
            extracted.keywords = {
                mesh_terms: article.meshTerms || [],
                keywords: article.keywords || [],
                combined: [...(article.meshTerms || []), ...(article.keywords || [])].slice(0, 15)
            };
        }

        // DOI链接
        if (extract_sections.includes("doi_link") && article.doi) {
            extracted.doi_link = {
                doi: article.doi,
                url: article.doi.startsWith('10.') ? `https://doi.org/${article.doi}` : article.url
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        pmid: pmid,
                        extracted_info: extracted,
                        extraction_metadata: {
                            sections: extract_sections,
                            max_abstract_length: max_abstract_length,
                            actual_mode: ABSTRACT_MODE,
                            actual_max_chars: ABSTRACT_MAX_CHARS
                        }
                    }, null, 2)
                }
            ]
        };
    }

    async handleCrossReference(args) {
        const { pmid, reference_type = "similar", max_results = 10 } = args;

        // 简化实现：基于相似性搜索相关文献
        let relatedQuery = pmid; // 基础实现

        switch (reference_type) {
            case "similar":
                // 可以基于PMID获取相关文献
                relatedQuery = `${pmid}[uid]`;
                break;
            case "reviews":
                relatedQuery = `${pmid}[uid] AND review[publication type]`;
                break;
            default:
                relatedQuery = `${pmid}[uid]`;
        }

        const result = await this.searchPubMed(relatedQuery, max_results, 0, "relevance");

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        base_pmid: pmid,
                        reference_type: reference_type,
                        related_articles: this.formatForLLM(result.articles, "llm_optimized"),
                        metadata: {
                            found: result.articles.length,
                            max_results: max_results
                        }
                    }, null, 2)
                }
            ]
        };
    }

    async handleBatchQuery(args) {
        const { pmids, query_format = "llm_optimized", include_abstracts = true } = args;

        if (pmids.length > 20) {
            throw new Error("批量查询最多支持20个PMID");
        }

        const articles = await this.fetchArticleDetails(pmids);

        let formattedArticles;
        switch (query_format) {
            case "concise":
                formattedArticles = articles.map(article => ({
                    pmid: article.pmid,
                    title: article.title,
                    authors: article.authors.slice(0, 3).join(', ') + (article.authors.length > 3 ? ' et al.' : ''),
                    journal: article.journal,
                    date: article.publicationDate,
                    url: article.url
                }));
                break;
            case "detailed":
                formattedArticles = articles;
                break;
            case "llm_optimized":
            default:
                formattedArticles = this.formatForLLM(articles, "llm_optimized");
                break;
        }

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        success: true,
                        query_format: query_format,
                        articles: formattedArticles,
                        metadata: {
                            total_queried: pmids.length,
                            found: articles.length,
                            include_abstracts: include_abstracts
                        }
                    }, null, 2)
                }
            ]
        };
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("PubMed Data Server v2.0 running on stdio");
        console.error(`[AbstractMode] ${ABSTRACT_MODE} (max_chars=${ABSTRACT_MAX_CHARS}) - ${ABSTRACT_MODE_NOTE}`);
    }
}

// 启动服务器
const server = new PubMedDataServer();
server.run().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});