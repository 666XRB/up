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
        this.navContainer = null;
        this.currentPageNum = 1;
        this.pdfDoc = null;
        this.scale = 1;
        this.isInitialized = false;
        this.renderedPages = new Set(); // 已渲染的页面集合
        this.isLoading = false; // 加载状态标志
        this.fileId = null; // 当前预览文件的唯一标识
        
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

            // 创建PDF容器和导航控件
            this.createPDFContainer();
            this.createNavigationControls();

            // 尝试从缓存中获取PDF数据
            let pdfData = PDFCacheManager.get(this.fileId);
            
            if (!pdfData) {
                // 缓存中不存在，加载PDF
                pdfData = await this.loadPDFData(fileData.dataUrl);
                // 存入缓存
                PDFCacheManager.set(this.fileId, pdfData);
            }
            
            this.pdfDoc = pdfData.pdf;
            this.currentPageNum = 1;
            this.renderedPages.clear();

            // 检测设备类型并设置合适的缩放比例
            this.detectDeviceAndSetScale();

            // 只渲染第一页，其余页面按需渲染
            await this.renderPage(this.currentPageNum);
            
            // 初始化滚动监听，实现按需加载
            this.setupScrollListener();

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
            
            // 更新导航控件状态
            this.updateNavigationControls();
            
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
        } catch (error) {
            console.error('创建PDF容器时出错:', error);
            throw error;
        }
    }

    // 创建导航控件
    createNavigationControls() {
        try {
            // 移除旧的导航控件（如果存在）
            if (this.navContainer) {
                try {
                    this.navContainer.parentNode.removeChild(this.navContainer);
                } catch (e) {
                    console.warn('移除旧的导航控件时出错:', e);
                }
            }

            // 创建导航容器
            this.navContainer = document.createElement('div');
            this.navContainer.className = 'pdf-navigation';
            this.navContainer.style.width = '100%';
            this.navContainer.style.padding = '10px 0';
            this.navContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            this.navContainer.style.display = 'flex';
            this.navContainer.style.justifyContent = 'center';
            this.navContainer.style.alignItems = 'center';
            this.navContainer.style.gap = '10px';
            this.navContainer.style.boxSizing = 'border-box';
            
            // 上一页按钮
            const prevBtn = document.createElement('button');
            prevBtn.textContent = '上一页';
            prevBtn.className = 'pdf-nav-btn';
            prevBtn.style.padding = '8px 16px';
            prevBtn.style.border = 'none';
            prevBtn.style.backgroundColor = '#007bff';
            prevBtn.style.color = 'white';
            prevBtn.style.borderRadius = '4px';
            prevBtn.style.cursor = 'pointer';
            prevBtn.disabled = true; // 初始禁用
            prevBtn.addEventListener('click', () => this.goToPreviousPage());
            
            // 页码显示
            const pageInfo = document.createElement('div');
            pageInfo.className = 'pdf-page-info';
            pageInfo.style.fontSize = '14px';
            pageInfo.style.minWidth = '100px';
            pageInfo.style.textAlign = 'center';
            pageInfo.textContent = '页码: 0/0';
            
            // 下一页按钮
            const nextBtn = document.createElement('button');
            nextBtn.textContent = '下一页';
            nextBtn.className = 'pdf-nav-btn';
            nextBtn.style.padding = '8px 16px';
            nextBtn.style.border = 'none';
            nextBtn.style.backgroundColor = '#007bff';
            nextBtn.style.color = 'white';
            nextBtn.style.borderRadius = '4px';
            nextBtn.style.cursor = 'pointer';
            nextBtn.disabled = true; // 初始禁用
            nextBtn.addEventListener('click', () => this.goToNextPage());
            
            // 缩放控件
            const zoomControls = document.createElement('div');
            zoomControls.style.display = 'flex';
            zoomControls.style.gap = '5px';
            
            const zoomOutBtn = document.createElement('button');
            zoomOutBtn.textContent = '-';
            zoomOutBtn.style.padding = '8px 12px';
            zoomOutBtn.style.border = 'none';
            zoomOutBtn.style.backgroundColor = '#6c757d';
            zoomOutBtn.style.color = 'white';
            zoomOutBtn.style.borderRadius = '4px';
            zoomOutBtn.style.cursor = 'pointer';
            zoomOutBtn.addEventListener('click', () => this.zoomOut());
            
            const zoomInBtn = document.createElement('button');
            zoomInBtn.textContent = '+';
            zoomInBtn.style.padding = '8px 12px';
            zoomInBtn.style.border = 'none';
            zoomInBtn.style.backgroundColor = '#6c757d';
            zoomInBtn.style.color = 'white';
            zoomInBtn.style.borderRadius = '4px';
            zoomInBtn.style.cursor = 'pointer';
            zoomInBtn.addEventListener('click', () => this.zoomIn());
            
            // 缩放百分比显示
            const zoomLevel = document.createElement('span');
            zoomLevel.style.minWidth = '40px';
            zoomLevel.style.textAlign = 'center';
            zoomLevel.textContent = '100%';
            
            zoomControls.appendChild(zoomOutBtn);
            zoomControls.appendChild(zoomLevel);
            zoomControls.appendChild(zoomInBtn);
            
            // 添加到导航容器
            this.navContainer.appendChild(prevBtn);
            this.navContainer.appendChild(pageInfo);
            this.navContainer.appendChild(nextBtn);
            this.navContainer.appendChild(zoomControls);
            
            // 保存引用
            this.navElements = {
                prevBtn,
                nextBtn,
                pageInfo,
                zoomLevel
            };
            
            // 添加到模态框内容中，放在PDF容器上方
            if (this.modalContent && this.canvasContainer) {
                this.modalContent.insertBefore(this.navContainer, this.canvasContainer);
            }
        } catch (error) {
            console.error('创建导航控件时出错:', error);
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
            
            // 添加页码标记
            const pageNumber = document.createElement('div');
            pageNumber.style.fontSize = '12px';
            pageNumber.style.color = '#666';
            pageNumber.style.marginTop = '5px';
            pageNumber.textContent = `第 ${num} 页`;
            
            // 添加到容器
            pageContainer.appendChild(canvas);
            pageContainer.appendChild(pageNumber);
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
            this.updateNavigationControls();
        }
    }

    // 更新导航控件状态
    updateNavigationControls() {
        if (!this.navElements || !this.pdfDoc) return;
        
        const { prevBtn, nextBtn, pageInfo, zoomLevel } = this.navElements;
        
        // 更新页码信息
        pageInfo.textContent = `页码: ${this.currentPageNum}/${this.pdfDoc.numPages}`;
        
        // 更新按钮状态
        prevBtn.disabled = this.currentPageNum <= 1;
        nextBtn.disabled = this.currentPageNum >= this.pdfDoc.numPages;
        
        // 更新缩放百分比
        zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
        
        // 根据禁用状态更新按钮样式
        prevBtn.style.opacity = prevBtn.disabled ? '0.5' : '1';
        prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
        nextBtn.style.opacity = nextBtn.disabled ? '0.5' : '1';
        nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
    }

    // 上一页
    goToPreviousPage() {
        if (this.currentPageNum > 1) {
            this.goToPage(this.currentPageNum - 1);
        }
    }

    // 下一页
    goToNextPage() {
        if (this.pdfDoc && this.currentPageNum < this.pdfDoc.numPages) {
            this.goToPage(this.currentPageNum + 1);
        }
    }

    // 跳转到指定页码
    goToPage(pageNum) {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pdfDoc.numPages) return;
        
        this.currentPageNum = pageNum;
        
        // 确保页面已渲染
        this.renderPage(pageNum);
        
        // 滚动到指定页面
        setTimeout(() => {
            const pageElement = document.getElementById(`pdf-page-${pageNum}`);
            if (pageElement && this.canvasContainer) {
                const containerRect = this.canvasContainer.getBoundingClientRect();
                const pageRect = pageElement.getBoundingClientRect();
                const scrollTo = pageElement.offsetTop - containerRect.top - 50; // 50px的上边距
                this.canvasContainer.scrollTo({ top: scrollTo, behavior: 'smooth' });
            }
        }, 100);
        
        // 更新导航控件状态
        this.updateNavigationControls();
    }

    // 放大
    zoomIn() {
        const newScale = this.scale * 1.2;
        if (newScale <= 3) { // 最大放大3倍
            this.setScale(newScale);
        }
    }

    // 缩小
    zoomOut() {
        const newScale = this.scale / 1.2;
        if (newScale >= 0.5) { // 最小缩小0.5倍
            this.setScale(newScale);
        }
    }

    // 设置缩放比例
    setScale(scale) {
        this.scale = scale;
        
        // 重新渲染当前页和附近的页面
        this.renderedPages.clear();
        
        // 清空容器
        if (this.canvasContainer) {
            while (this.canvasContainer.firstChild) {
                this.canvasContainer.removeChild(this.canvasContainer.firstChild);
            }
        }
        
        // 重新渲染当前页和前后各一页
        this.renderPage(this.currentPageNum);
        if (this.pdfDoc && this.currentPageNum > 1) {
            this.renderPage(this.currentPageNum - 1);
        }
        if (this.pdfDoc && this.currentPageNum < this.pdfDoc.numPages) {
            this.renderPage(this.currentPageNum + 1);
        }
        
        // 更新导航控件状态
        this.updateNavigationControls();
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
            
            // 移除导航控件
            if (this.navContainer && this.navContainer.parentNode) {
                try {
                    this.navContainer.parentNode.removeChild(this.navContainer);
                } catch (e) {
                    console.warn('移除导航控件时出错:', e);
                }
            }
            
            // 重置状态
            this.canvasContainer = null;
            this.navContainer = null;
            this.navElements = null;
            this.pdfDoc = null;
            this.currentPageNum = 1;
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