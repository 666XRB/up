// PDF预览功能 - 基于PDF.js官方查看器的集成实现

// 全局缓存管理 - 增强版
const PDFCacheManager = {
    cache: new Map(),
    maxCacheSize: 3, // 最多缓存3个PDF文件
    
    get(key) {
        const cached = this.cache.get(key);
        if (cached) {
            console.log(`从缓存中获取PDF: ${key}`);
            // 检查缓存是否有效
            if (cached.pdfData) {
                return cached;
            } else {
                console.warn(`缓存的PDF数据无效，将重新加载: ${key}`);
                this.cache.delete(key);
                return null;
            }
        }
        return null;
    },
    
    set(key, data) {
        // 验证数据有效性
        if (!data || !data.pdfData) {
            console.warn(`无法缓存无效的PDF数据: ${key}`);
            return;
        }
        
        // 如果缓存已满，移除最早的项
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            console.log(`缓存已满，移除最早的项: ${firstKey}`);
            this.cache.delete(firstKey);
        }
        console.log(`PDF缓存成功: ${key}`);
        this.cache.set(key, data);
    },
    
    clear() {
        console.log('清除所有PDF缓存');
        this.cache.clear();
    }
};

/**
 * PDF预览器类 - 基于官方PDF.js查看器的封装
 */
class PDFPreviewer {
    /**
     * 构造函数
     * @param {string} containerId - 容器ID
     */
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.iframe = null;
        this.pdfData = null;
        this.isLoading = false;
    }

    /**
     * 加载并显示PDF文件
     * @param {object} fileData - 文件数据对象
     * @param {HTMLElement} modalContent - 模态框内容元素
     * @param {HTMLElement} modalInfo - 模态框信息元素
     * @param {HTMLElement} loadingIndicator - 加载指示器元素
     * @returns {Promise} - 返回Promise对象
     */
    async loadPDF(fileData, modalContent = null, modalInfo = null, loadingIndicator = null) {
        if (!this.container) {
            throw new Error(`容器元素 #${this.containerId} 不存在`);
        }

        if (this.isLoading) {
            console.warn('正在加载其他PDF文件，请稍候');
            return;
        }

        this.isLoading = true;
        this.pdfData = fileData;
        
        try {
            // 清空容器
            this.container.innerHTML = '';
            
            // 创建iframe来加载官方PDF.js查看器
            this.iframe = document.createElement('iframe');
            this.iframe.className = 'pdf-viewer-iframe';
            this.iframe.style.width = '100%';
            this.iframe.style.height = modalContent ? '70vh' : '100%';
            this.iframe.style.border = 'none';
            this.iframe.style.borderRadius = '10px';
            this.iframe.title = 'PDF查看器';
            
            // 添加到容器
            this.container.appendChild(this.iframe);
            
            // 等待iframe加载完成
            await this.waitForIframeLoad();
            
            // 移除加载指示器
            if (loadingIndicator && loadingIndicator.parentNode) {
                try {
                    loadingIndicator.parentNode.removeChild(loadingIndicator);
                } catch (e) {
                    console.warn('移除加载指示器时出错:', e);
                }
            }
            
            console.log('PDF查看器加载成功');
            return this;
        } catch (error) {
            console.error('加载PDF查看器时出错:', error);
            this.showError(`加载PDF查看器失败: ${error.message}`);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 等待iframe加载完成
     * @returns {Promise} - 返回Promise对象
     */
    waitForIframeLoad() {
        return new Promise((resolve, reject) => {
            // 设置官方PDF.js查看器的URL（使用相对路径）
            const viewerUrl = 'pdf/web/viewer.html';
            
            // 如果有文件URL，将其作为查询参数传递给查看器
            let url = viewerUrl;
            if (this.pdfData && this.pdfData.dataUrl) {
                // 对dataUrl进行编码
                const encodedUrl = encodeURIComponent(this.pdfData.dataUrl);
                url = `${viewerUrl}?file=${encodedUrl}`;
            }
            
            console.log(`加载PDF查看器: ${url}`);
            // 设置iframe的src
            this.iframe.src = url;
            
            // 设置加载完成事件
            this.iframe.onload = () => {
                console.log('iframe加载完成');
                resolve();
            };
            
            // 设置加载错误事件
            this.iframe.onerror = (error) => {
                console.error('iframe加载错误:', error);
                reject(new Error('加载PDF查看器失败'));
            };
            
            // 设置超时处理
            setTimeout(() => {
                if (this.isLoading) {
                    reject(new Error('PDF查看器加载超时'));
                }
            }, 30000); // 30秒超时
        });
    }

    /**
     * 显示错误信息
     * @param {string} message - 错误信息
     */
    showError(message) {
        let errorElement = document.getElementById('pdf-error');
        
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'pdf-error';
            errorElement.style.color = 'red';
            errorElement.style.backgroundColor = '#ffebee';
            errorElement.style.padding = '10px';
            errorElement.style.borderRadius = '4px';
            errorElement.style.marginBottom = '10px';
            
            if (this.container.firstChild) {
                this.container.insertBefore(errorElement, this.container.firstChild);
            } else {
                this.container.appendChild(errorElement);
            }
        }
        
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.iframe) {
            // 停止iframe中的PDF查看器
            this.iframe.src = 'about:blank';
            this.iframe.remove();
            this.iframe = null;
        }
        
        if (this.container) {
            this.container.innerHTML = '';
        }
        
        this.pdfData = null;
        this.isLoading = false;
    }
}

/**
 * 全局函数，方便外部调用 - 创建PDF预览
 * @param {object} fileData - 文件数据对象
 * @param {HTMLElement} modalContent - 模态框内容元素
 * @param {HTMLElement} modalInfo - 模态框信息元素
 * @param {HTMLElement} loadingIndicator - 加载指示器元素
 * @returns {Promise} - 返回Promise对象
 */
window.createPDFPreview = function(fileData, modalContent, modalInfo, loadingIndicator) {
    // 创建唯一的容器ID
    const containerId = 'pdf-container-' + Date.now();
    
    // 创建容器元素
    const container = document.createElement('div');
    container.id = containerId;
    container.style.width = '100%';
    container.style.height = '100%';
    
    // 添加到模态框内容
    if (modalContent) {
        modalContent.appendChild(container);
    }
    
    // 创建PDF预览器实例
    const previewer = new PDFPreviewer(containerId);
    
    // 加载PDF文件
    return new Promise((resolve, reject) => {
        previewer.loadPDF(fileData, modalContent, modalInfo, loadingIndicator)
            .then(() => resolve(previewer))
            .catch(error => reject(error));
    });
};

/**
 * 全局函数，方便外部调用 - 清理PDF预览
 * @param {PDFPreviewer} previewer - PDF预览器实例
 */
window.cleanupPDFPreview = function(previewer) {
    if (previewer && typeof previewer.cleanup === 'function') {
        previewer.cleanup();
    }
};