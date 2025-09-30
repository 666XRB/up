// PDF预览功能 - 基于PDF.js的跨平台优化实现

// 全局缓存管理
const PDFCacheManager = {
    cache: new Map(),
    maxCacheSize: 3, // 最多缓存3个PDF文件
    
    get(key) {
        return this.cache.get(key);
    },
    
    set(key, data) {
        // 如果缓存已满，移除最早的项
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, data);
    },
    
    clear() {
        this.cache.clear();
    }
};

class PDFPreviewer {
    constructor(modalContent, modalInfo, loadingIndicator) {
        this.modalContent = modalContent;
        this.modalInfo = modalInfo;
        this.loadingIndicator = loadingIndicator;
        this.pdfjsLib = null;
        this.canvasContainer = null;
        this.currentPageNum = 1;
        this.pdfDoc = null;
        this.scale = 1;
        this.isInitialized = false;
        this.renderedPages = new Set(); // 已渲染的页面集合
        this.isLoading = false; // 加载状态标志
        this.fileId = null; // 当前预览文件的唯一标识
        this.scrollListener = null;
        this.pageInfoElement = null;
        this.totalPages = 0;
        
        // 初始化PDF.js库
        this.initializePDFJS();
    }

    // 初始化PDF.js库
    initializePDFJS() {
        try {
            // 检查是否已加载PDF.js库
            if (window.pdfjsLib) {
                this.pdfjsLib = window.pdfjsLib;
                this.isInitialized = true;
                console.log('PDF.js库已加载');
                return;
            }

            // 动态加载PDF.js库
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.async = true;
            script.onload = () => {
                this.pdfjsLib = window.pdfjsLib;
                // 配置PDF.js的worker路径
                this.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                this.isInitialized = true;
                console.log('PDF.js库加载成功');
            };
            script.onerror = () => {
                console.error('PDF.js库加载失败');
            };
            document.head.appendChild(script);
        } catch (error) {
            console.error('初始化PDF.js时出错:', error);
        }
    }

    // 预览PDF文件
    async previewPDF(fileData) {
        try {
            // 防止同时预览多个文件
            if (this.isLoading) {
                throw new Error('正在加载其他PDF文件，请稍候');
            }
            this.isLoading = true;
            
            // 生成文件唯一标识
            this.fileId = fileData.name + '_' + fileData.size + '_' + (new Date(fileData.lastModified)).getTime();
            
            // 显示加载指示器
            if (this.loadingIndicator) {
                this.loadingIndicator.textContent = '正在准备PDF预览...';
            }
            
            // 等待PDF.js库初始化完成
            if (!this.isInitialized) {
                await this.waitForPDFJS();
            }

            if (!this.pdfjsLib) {
                throw new Error('PDF.js库未初始化成功');
            }

            // 创建PDF容器
            this.createPDFContainer();

            // 尝试从缓存中获取PDF数据
            let pdfData = PDFCacheManager.get(this.fileId);
            
            if (!pdfData) {
                // 缓存中不存在，加载PDF
                pdfData = await this.loadPDFData(fileData.dataUrl);
                // 存入缓存
                PDFCacheManager.set(this.fileId, pdfData);
            }
            
            this.pdfDoc = pdfData.pdf;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPageNum = 1;
            this.renderedPages.clear();

            // 检测设备类型并设置合适的缩放比例
            this.detectDeviceAndSetScale();

            // 只渲染第一页，其余页面按需渲染
            await this.renderPage(this.currentPageNum);
            
            // 初始化滚动监听，实现按需加载
            this.setupScrollListener();

            // 添加触摸和鼠标操作支持
            this.setupGestureSupport();

            // 更新加载指示器
            if (this.loadingIndicator) {
                this.loadingIndicator.textContent = `PDF预览加载完成`;
                // 延迟移除加载指示器
                setTimeout(() => {
                    if (this.loadingIndicator && this.loadingIndicator.parentNode) {
                        try {
                            this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
                        } catch (e) {
                            console.warn('移除加载指示器时出错:', e);
                        }
                    }
                }, 500);
            }
            
        } catch (error) {
            console.error('预览PDF时出错:', error);
            this.handlePreviewError(error.message || 'PDF预览失败，请尝试下载后查看');
        } finally {
            this.isLoading = false;
        }
    }

    // 等待PDF.js库加载完成
    waitForPDFJS() {
        return new Promise((resolve, reject) => {
            const maxWaitTime = 7000; // 最多等待7秒
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                if (this.isInitialized) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    reject(new Error('PDF.js库加载超时'));
                }
            }, 100);
        });
    }

    // 加载PDF数据，优化大文件处理
    async loadPDFData(dataUrl) {
        try {
            // 创建加载配置，优化大文件加载
            const loadingTaskConfig = {
                url: dataUrl,
                verbosity: 0, // 减少日志输出
                disableFontFace: false, // 启用字体渲染
                workerIdleTimeout: 30000, // 延长worker空闲时间
                maxImageSize: 16384, // 增加最大图像尺寸
                useSystemFonts: true // 使用系统字体
            };
            
            // 显示加载进度
            let lastProgress = 0;
            const loadingTask = this.pdfjsLib.getDocument(loadingTaskConfig);
            
            loadingTask.onProgress = (progressData) => {
                const progress = Math.round((progressData.loaded / progressData.total) * 100);
                // 避免过于频繁的更新
                if (progress > lastProgress + 5) {
                    lastProgress = progress;
                    if (this.loadingIndicator) {
                        this.loadingIndicator.textContent = `正在加载PDF... ${progress}%`;
                    }
                }
            };
            
            const pdf = await loadingTask.promise;
            return { pdf, isDataUrl: true };
        } catch (error) {
            console.error('从Data URL加载PDF失败:', error);
            
            // 作为备选方案，尝试使用fetch加载
            try {
                if (this.loadingIndicator) {
                    this.loadingIndicator.textContent = '尝试备用方式加载PDF...';
                }
                const response = await fetch(dataUrl);
                const arrayBuffer = await response.arrayBuffer();
                const pdf = await this.pdfjsLib.getDocument(arrayBuffer).promise;
                return { pdf, isDataUrl: false };
            } catch (fetchError) {
                console.error('使用fetch加载PDF也失败了:', fetchError);
                throw new Error('无法加载PDF文件数据');
            }
        }
    }

    // 创建PDF预览容器
    createPDFContainer() {
        try {
            // 移除旧的PDF容器（如果存在）
            if (this.canvasContainer) {
                try {
                    this.canvasContainer.parentNode.removeChild(this.canvasContainer);
                } catch (e) {
                    console.warn('移除旧的PDF容器时出错:', e);
                }
            }

            // 创建新的容器
            this.canvasContainer = document.createElement('div');
            this.canvasContainer.className = 'pdf-container';
            this.canvasContainer.style.width = '100%';
            this.canvasContainer.style.height = '70vh';
            this.canvasContainer.style.overflow = 'auto';
            this.canvasContainer.style.textAlign = 'center';
            this.canvasContainer.style.padding = '10px';
            this.canvasContainer.style.boxSizing = 'border-box';
            this.canvasContainer.style.backgroundColor = '#f5f5f5';
            
            // 添加到模态框内容中
            if (this.modalContent && this.modalInfo) {
                this.modalContent.insertBefore(this.canvasContainer, this.modalInfo);
            }
            
            // 创建页面信息显示区域（简洁的页脚显示）
            this.createPageInfoDisplay();
        } catch (error) {
            console.error('创建PDF容器时出错:', error);
            throw error;
        }
    }

    // 创建页面信息显示区域（简洁的页脚显示）
    createPageInfoDisplay() {
        try {
            // 移除旧的页码显示（如果存在）
            if (this.pageInfoElement && this.pageInfoElement.parentNode) {
                try {
                    this.pageInfoElement.parentNode.removeChild(this.pageInfoElement);
                } catch (e) {
                    console.warn('移除旧的页码显示时出错:', e);
                }
            }

            // 创建页面信息显示元素
            this.pageInfoElement = document.createElement('div');
            this.pageInfoElement.className = 'pdf-page-info';
            this.pageInfoElement.style.position = 'absolute';
            this.pageInfoElement.style.bottom = '10px';
            this.pageInfoElement.style.right = '10px';
            this.pageInfoElement.style.fontSize = '12px';
            this.pageInfoElement.style.color = '#666';
            this.pageInfoElement.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            this.pageInfoElement.style.padding = '4px 8px';
            this.pageInfoElement.style.borderRadius = '4px';
            this.pageInfoElement.style.zIndex = '10';
            this.pageInfoElement.textContent = '页码: 1/0'; // 默认值
            
            // 添加到模态框内容中
            if (this.modalContent) {
                this.modalContent.style.position = 'relative';
                this.modalContent.appendChild(this.pageInfoElement);
            }
        } catch (error) {
            console.error('创建页码显示时出错:', error);
        }
    }

    // 渲染指定页码（优化版，支持按需渲染和页面缓存）
    async renderPage(num) {
        try {
            // 检查页码是否有效
            if (!this.pdfDoc || num < 1 || num > this.pdfDoc.numPages) {
                return;
            }
            
            // 检查页面是否已经渲染
            if (this.renderedPages.has(num)) {
                return;
            }
            
            // 标记页面为已渲染（防止重复渲染）
            this.renderedPages.add(num);
            
            const page = await this.pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: this.scale });

            // 创建画布容器
            const pageContainer = document.createElement('div');
            pageContainer.id = `pdf-page-${num}`;
            pageContainer.style.marginBottom = '20px';
            pageContainer.style.textAlign = 'center';
            
            // 创建画布
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            canvas.style.maxWidth = '100%';
            canvas.style.height = 'auto';
            canvas.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            canvas.style.backgroundColor = 'white';
            
            // 添加到容器
            pageContainer.appendChild(canvas);
            this.canvasContainer.appendChild(pageContainer);

            // 渲染页面内容
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            // 使用优化的渲染配置
            const renderTask = page.render(renderContext);
            
            // 设置渲染优先级，当前页优先渲染
            if (num === this.currentPageNum) {
                renderTask.priority = 1;
            }
            
            await renderTask.promise;
            console.log(`已渲染第${num}页`);
            
            // 更新页码显示
            this.updatePageInfoDisplay();
            
        } catch (error) {
            console.error(`渲染第${num}页时出错:`, error);
            // 出错时从已渲染集合中移除，允许重试
            this.renderedPages.delete(num);
            
            // 显示错误页面
            const errorPage = document.createElement('div');
            errorPage.id = `pdf-page-${num}`;
            errorPage.style.width = '100%';
            errorPage.style.height = '400px';
            errorPage.style.display = 'flex';
            errorPage.style.justifyContent = 'center';
            errorPage.style.alignItems = 'center';
            errorPage.style.backgroundColor = '#fee';
            errorPage.style.color = '#a00';
            errorPage.style.marginBottom = '20px';
            errorPage.style.borderRadius = '4px';
            errorPage.textContent = `第 ${num} 页渲染失败`;
            
            this.canvasContainer.appendChild(errorPage);
        }
    }

    // 设置滚动监听器，实现按需加载
    setupScrollListener() {
        if (!this.canvasContainer) return;
        
        // 节流函数，避免过于频繁的滚动检测
        const throttle = (func, limit) => {
            let inThrottle;
            return function() {
                const args = arguments;
                const context = this;
                if (!inThrottle) {
                    func.apply(context, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        };
        
        // 滚动检测函数
        const checkScroll = throttle(() => {
            if (!this.canvasContainer || !this.pdfDoc) return;
            
            const container = this.canvasContainer;
            const containerRect = container.getBoundingClientRect();
            const viewportHeight = containerRect.height;
            const viewportTop = container.scrollTop;
            const viewportBottom = viewportTop + viewportHeight;
            
            // 预加载范围：视口上下各延伸1个屏幕高度
            const preloadMargin = viewportHeight;
            const preloadTop = viewportTop - preloadMargin;
            const preloadBottom = viewportBottom + preloadMargin;
            
            // 检查当前页码
            this.updateCurrentPage();
            
            // 找出需要预加载的页码
            for (let i = 1; i <= this.pdfDoc.numPages; i++) {
                const pageElement = document.getElementById(`pdf-page-${i}`);
                
                if (!pageElement && !this.renderedPages.has(i)) {
                    // 如果页面元素不存在且未标记为已渲染，则尝试预加载
                    // 对于前几页和当前页附近的页面优先预加载
                    if (i <= 3 || Math.abs(i - this.currentPageNum) <= 2) {
                        this.renderPage(i);
                    }
                } else if (pageElement) {
                    const pageRect = pageElement.getBoundingClientRect();
                    const pageTop = pageRect.top;
                    const pageBottom = pageRect.bottom;
                    
                    // 如果页面在预加载范围内且未渲染，则渲染
                    if (!this.renderedPages.has(i) &&
                        ((pageTop >= preloadTop && pageTop <= preloadBottom) ||
                         (pageBottom >= preloadTop && pageBottom <= preloadBottom))) {
                        this.renderPage(i);
                    }
                }
            }
        }, 200); // 200ms的节流间隔
        
        // 添加滚动事件监听
        this.canvasContainer.addEventListener('scroll', checkScroll);
        
        // 保存引用以便后续清理
        this.scrollListener = checkScroll;
    }

    // 设置手势支持（缩放和滚动）
    setupGestureSupport() {
        if (!this.canvasContainer) return;
        
        let startX, startY, startScrollLeft, startScrollTop;
        let scaleGestureEnabled = false;
        let lastDistance = 0;
        let lastScale = 1;
        
        // 鼠标滚轮缩放支持
        this.canvasContainer.addEventListener('wheel', (e) => {
            // 仅当按住Ctrl键时才缩放
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const newScale = Math.max(0.5, Math.min(3, this.scale + delta));
                if (newScale !== this.scale) {
                    this.setScale(newScale);
                }
            }
        }, { passive: false });
        
        // 触摸事件支持（移动设备）
        this.canvasContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            startScrollLeft = this.canvasContainer.scrollLeft;
            startScrollTop = this.canvasContainer.scrollTop;
            
            // 检测双指缩放
            if (e.touches.length === 2) {
                scaleGestureEnabled = true;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastDistance = Math.sqrt(dx * dx + dy * dy);
                lastScale = this.scale;
            }
        }, { passive: true });
        
        this.canvasContainer.addEventListener('touchmove', (e) => {
            if (scaleGestureEnabled && e.touches.length === 2) {
                e.preventDefault();
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                const scaleFactor = distance / lastDistance;
                const newScale = Math.max(0.5, Math.min(3, lastScale * scaleFactor));
                
                if (Math.abs(newScale - this.scale) > 0.05) { // 只有当缩放变化足够大时才更新
                    this.setScale(newScale);
                    lastScale = newScale;
                    lastDistance = distance;
                }
            } else if (e.touches.length === 1) {
                const x = e.touches[0].clientX;
                const y = e.touches[0].clientY;
                const walkX = x - startX;
                const walkY = y - startY;
                
                this.canvasContainer.scrollLeft = startScrollLeft - walkX;
                this.canvasContainer.scrollTop = startScrollTop - walkY;
            }
        }, { passive: false });
        
        this.canvasContainer.addEventListener('touchend', () => {
            scaleGestureEnabled = false;
        }, { passive: true });
    }

    // 更新当前页码
    updateCurrentPage() {
        if (!this.canvasContainer || !this.pdfDoc) return;
        
        const container = this.canvasContainer;
        const containerHeight = container.clientHeight;
        const scrollPosition = container.scrollTop + containerHeight / 2; // 视口中心点
        
        let closestPage = this.currentPageNum;
        let minDistance = Infinity;
        
        // 找出最接近视口中心的页面
        for (let i = 1; i <= this.pdfDoc.numPages; i++) {
            const pageElement = document.getElementById(`pdf-page-${i}`);
            if (pageElement) {
                const pageRect = pageElement.getBoundingClientRect();
                const pageCenter = pageRect.top + pageRect.height / 2;
                const distance = Math.abs(pageCenter - scrollPosition);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestPage = i;
                }
            }
        }
        
        if (closestPage !== this.currentPageNum) {
            this.currentPageNum = closestPage;
            this.updatePageInfoDisplay();
        }
    }

    // 更新页码信息显示
    updatePageInfoDisplay() {
        if (this.pageInfoElement && this.pdfDoc) {
            this.pageInfoElement.textContent = `页码: ${this.currentPageNum}/${this.pdfDoc.numPages}`;
        }
    }

    // 设置缩放比例
    setScale(scale) {
        this.scale = scale;
        
        // 保存当前页码
        const currentPage = this.currentPageNum;
        
        // 重新渲染当前页和附近的页面
        this.renderedPages.clear();
        
        // 清空容器
        if (this.canvasContainer) {
            while (this.canvasContainer.firstChild) {
                this.canvasContainer.removeChild(this.canvasContainer.firstChild);
            }
        }
        
        // 重新渲染当前页和前后各一页
        this.renderPage(currentPage);
        if (this.pdfDoc && currentPage > 1) {
            this.renderPage(currentPage - 1);
        }
        if (this.pdfDoc && currentPage < this.pdfDoc.numPages) {
            this.renderPage(currentPage + 1);
        }
    }

    // 检测设备类型并设置合适的缩放比例
    detectDeviceAndSetScale() {
        try {
            // 检测是否为移动设备
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            // 获取容器宽度
            const containerWidth = this.canvasContainer.clientWidth || 800;
            
            // 根据设备类型和容器宽度设置缩放比例
            if (isMobile) {
                // 移动设备上使用较大的缩放比例
                this.scale = Math.min(containerWidth / 595, 2); // 595是A4纸的宽度（像素）
            } else {
                // 桌面设备上使用适中的缩放比例
                this.scale = Math.min(containerWidth / 595, 1.5);
            }
            
            console.log(`设备类型: ${isMobile ? '移动设备' : '桌面设备'}, 设置缩放比例: ${this.scale}`);
        } catch (error) {
            console.error('检测设备类型时出错:', error);
            // 出错时使用默认缩放比例
            this.scale = 1;
        }
    }

    // 处理预览错误
    handlePreviewError(errorMessage) {
        try {
            // 移除加载指示器
            if (this.loadingIndicator && this.loadingIndicator.parentNode) {
                try {
                    this.loadingIndicator.parentNode.removeChild(this.loadingIndicator);
                } catch (e) {
                    console.warn('移除加载指示器时出错:', e);
                }
            }

            // 显示错误信息
            const errorElement = document.createElement('div');
            errorElement.className = 'pdf-error';
            errorElement.style.width = '100%';
            errorElement.style.height = '70vh';
            errorElement.style.display = 'flex';
            errorElement.style.flexDirection = 'column';
            errorElement.style.justifyContent = 'center';
            errorElement.style.alignItems = 'center';
            errorElement.style.backgroundColor = '#fff3cd';
            errorElement.style.color = '#856404';
            errorElement.style.padding = '20px';
            errorElement.style.textAlign = 'center';
            
            errorElement.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 20px;">📄</div>
                <p style="font-size: 1.1rem; margin-bottom: 15px;">${errorMessage}</p>
                <p>请尝试点击下载按钮保存文件后查看</p>
            `;
            
            // 添加到模态框内容中
            if (this.modalContent && this.modalInfo) {
                this.modalContent.insertBefore(errorElement, this.modalInfo);
            }
        } catch (error) {
            console.error('处理预览错误时出错:', error);
        }
    }

    // 清理资源
    cleanup() {
        try {
            // 移除滚动监听器
            if (this.canvasContainer && this.scrollListener) {
                this.canvasContainer.removeEventListener('scroll', this.scrollListener);
                this.scrollListener = null;
            }
            
            // 移除PDF容器
            if (this.canvasContainer && this.canvasContainer.parentNode) {
                try {
                    this.canvasContainer.parentNode.removeChild(this.canvasContainer);
                } catch (e) {
                    console.warn('移除PDF容器时出错:', e);
                }
            }
            
            // 移除页码显示
            if (this.pageInfoElement && this.pageInfoElement.parentNode) {
                try {
                    this.pageInfoElement.parentNode.removeChild(this.pageInfoElement);
                } catch (e) {
                    console.warn('移除页码显示时出错:', e);
                }
            }
            
            // 重置状态
            this.canvasContainer = null;
            this.pageInfoElement = null;
            this.pdfDoc = null;
            this.currentPageNum = 1;
            this.totalPages = 0;
            this.renderedPages.clear();
            this.isLoading = false;
            this.fileId = null;
        } catch (error) {
            console.error('清理PDF预览资源时出错:', error);
        }
    }
}

// 导出函数，供外部调用
window.createPDFPreview = async function(fileData, modalContent, modalInfo, loadingIndicator) {
    try {
        // 确保只预览一个文件，清理可能存在的旧实例
        if (window.currentPDFPreviewer) {
            try {
                window.currentPDFPreviewer.cleanup();
            } catch (error) {
                console.warn('清理旧的PDF预览实例时出错:', error);
            }
        }
        
        // 创建PDF预览实例
        const pdfPreviewer = new PDFPreviewer(modalContent, modalInfo, loadingIndicator);
        
        // 保存当前预览实例引用
        window.currentPDFPreviewer = pdfPreviewer;
        
        // 执行预览
        await pdfPreviewer.previewPDF(fileData);
        
        // 返回实例，以便后续可以调用cleanup方法
        return pdfPreviewer;
    } catch (error) {
        console.error('创建PDF预览失败:', error);
        throw error;
    }
};

// 导出清理函数
window.cleanupPDFPreview = function(pdfPreviewer) {
    try {
        // 如果没有提供预览器实例，使用全局实例
        const previewer = pdfPreviewer || window.currentPDFPreviewer;
        
        if (previewer && typeof previewer.cleanup === 'function') {
            previewer.cleanup();
        }
        
        // 清除全局实例引用
        if (window.currentPDFPreviewer === previewer) {
            window.currentPDFPreviewer = null;
        }
    } catch (error) {
        console.error('清理PDF预览时出错:', error);
    }
};