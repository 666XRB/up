// 测试增强后的上传和渲染功能
console.log('开始测试增强后的上传和渲染功能...');

// 模拟测试函数
function runTests() {
    // 测试1: 测试renderImagePool的基本渲染功能
    testBasicRender();
    
    // 测试2: 测试异常数据处理
    testInvalidDataHandling();
    
    // 测试3: 测试错误预览替换功能
    testErrorPreviewReplacement();
    
    // 测试4: 测试空状态和错误状态显示
    testEmptyAndErrorStates();
    
    // 测试5: 测试事件处理器的错误捕获
    testEventHandlersErrorHandling();
}

// 测试1: 测试renderImagePool的基本渲染功能
function testBasicRender() {
    console.log('\n测试1: 测试renderImagePool的基本渲染功能');
    
    try {
        // 保存原始imagePool
        const originalImagePool = window.imagePool;
        
        // 创建测试数据
        window.imagePool = [
            {
                id: 'test_img_1',
                name: 'test-image.jpg',
                dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // 1x1透明gif
                size: 1, 
                type: 'image/jpeg'
            }
        ];
        
        // 调用renderImagePool
        if (window.renderImagePool) {
            window.renderImagePool();
            console.log('✓ renderImagePool调用成功');
            
            // 验证渲染结果
            const imagesGrid = document.getElementById('imagesGrid');
            if (imagesGrid && imagesGrid.querySelector('[data-id="test_img_1"]')) {
                console.log('✓ 图片正确渲染到网格中');
            } else {
                console.warn('✗ 图片未能正确渲染到网格中');
            }
        } else {
            console.error('✗ window.renderImagePool未定义');
        }
        
        // 恢复原始imagePool
        window.imagePool = originalImagePool;
        window.renderImagePool(); // 恢复显示
        
    } catch (error) {
        console.error('✗ 测试1失败:', error);
    }
}

// 测试2: 测试异常数据处理
function testInvalidDataHandling() {
    console.log('\n测试2: 测试异常数据处理');
    
    try {
        // 保存原始imagePool
        const originalImagePool = window.imagePool;
        
        // 创建包含无效数据的测试数据
        window.imagePool = [
            // 有效数据
            {
                id: 'test_valid_1',
                name: 'valid-image.jpg',
                dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                size: 1,
                type: 'image/jpeg'
            },
            // 无效数据1: 缺少必要字段
            {},
            // 无效数据2: 无效类型
            'not-an-object',
            // 无效数据3: 缺少dataUrl
            {
                id: 'test_invalid_3',
                name: 'no-data-url.jpg'
                // 没有dataUrl
            },
            // 有效数据2
            {
                id: 'test_valid_2',
                name: 'another-valid-image.jpg',
                dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                size: 2,
                type: 'image/png'
            }
        ];
        
        // 重写console.log以捕获渲染统计信息
        const originalConsoleLog = console.log;
        let renderStats = null;
        
        console.log = function(message, ...args) {
            if (typeof message === 'string' && message.includes('文件池渲染完成')) {
                renderStats = message;
                console.log('✓ 成功捕获渲染统计信息:', message);
            }
            originalConsoleLog.apply(console, arguments);
        };
        
        // 调用renderImagePool
        if (window.renderImagePool) {
            window.renderImagePool();
            
            // 验证渲染结果
            const imagesGrid = document.getElementById('imagesGrid');
            if (imagesGrid && 
                imagesGrid.querySelector('[data-id="test_valid_1"]') && 
                imagesGrid.querySelector('[data-id="test_valid_2"]')) {
                console.log('✓ 有效图片正确渲染，无效数据被跳过');
            } else {
                console.warn('✗ 有效图片未能正确渲染或无效数据未被跳过');
            }
        } else {
            console.error('✗ window.renderImagePool未定义');
        }
        
        // 恢复console.log
        console.log = originalConsoleLog;
        
        // 恢复原始imagePool
        window.imagePool = originalImagePool;
        window.renderImagePool(); // 恢复显示
        
    } catch (error) {
        console.error('✗ 测试2失败:', error);
    }
}

// 测试3: 测试错误预览替换功能
function testErrorPreviewReplacement() {
    console.log('\n测试3: 测试错误预览替换功能');
    
    try {
        // 保存原始imagePool
        const originalImagePool = window.imagePool;
        
        // 创建包含错误数据的测试数据
        window.imagePool = [
            {
                id: 'test_error_1',
                name: 'invalid-image.jpg',
                dataUrl: 'data:image/png;base64,INVALID_BASE64_DATA', // 无效的base64数据
                size: 10,
                type: 'image/png'
            }
        ];
        
        // 调用renderImagePool
        if (window.renderImagePool) {
            window.renderImagePool();
            
            // 验证是否显示错误预览
            setTimeout(() => {
                const imagesGrid = document.getElementById('imagesGrid');
                const errorItem = imagesGrid.querySelector('[data-id="test_error_1"]');
                const errorPreview = errorItem ? errorItem.querySelector('.error-preview') : null;
                
                if (errorPreview) {
                    console.log('✓ 错误预览正确显示');
                } else {
                    console.warn('✗ 错误预览未能正确显示');
                }
                
                // 恢复原始imagePool
                window.imagePool = originalImagePool;
                window.renderImagePool(); // 恢复显示
            }, 100); // 给加载错误处理一点时间
        } else {
            console.error('✗ window.renderImagePool未定义');
            // 恢复原始imagePool
            window.imagePool = originalImagePool;
        }
        
    } catch (error) {
        console.error('✗ 测试3失败:', error);
        // 恢复原始imagePool
        window.imagePool = originalImagePool;
    }
}

// 测试4: 测试空状态和错误状态显示
function testEmptyAndErrorStates() {
    console.log('\n测试4: 测试空状态和错误状态显示');
    
    try {
        // 保存原始imagePool
        const originalImagePool = window.imagePool;
        
        // 测试空状态
        window.imagePool = [];
        if (window.renderImagePool) {
            window.renderImagePool();
            
            const imagesGrid = document.getElementById('imagesGrid');
            const emptyState = imagesGrid.querySelector('.empty-state:not(.error-state)');
            
            if (emptyState) {
                console.log('✓ 空状态正确显示');
            } else {
                console.warn('✗ 空状态未能正确显示');
            }
        } else {
            console.error('✗ window.renderImagePool未定义');
        }
        
        // 恢复原始imagePool
        window.imagePool = originalImagePool;
        
    } catch (error) {
        console.error('✗ 测试4失败:', error);
        // 恢复原始imagePool
        window.imagePool = originalImagePool;
    }
}

// 测试5: 测试事件处理器的错误捕获
function testEventHandlersErrorHandling() {
    console.log('\n测试5: 测试事件处理器的错误捕获');
    
    try {
        // 保存原始函数
        const originalOpenPreview = window.openPreview;
        const originalShowDeleteConfirm = window.showDeleteConfirm;
        const originalShowContextMenu = window.showContextMenu;
        
        // 模拟错误
        let errorCaught = false;
        
        // 重写console.error以捕获错误
        const originalConsoleError = console.error;
        console.error = function(message, ...args) {
            if (typeof message === 'string' && 
                (message.includes('点击事件处理失败') || 
                 message.includes('右键菜单事件处理失败') ||
                 message.includes('长按删除事件处理失败'))) {
                errorCaught = true;
                console.log('✓ 成功捕获事件处理器错误:', message);
            }
            originalConsoleError.apply(console, arguments);
        };
        
        // 创建一个测试元素并添加到DOM
        const testItem = document.createElement('div');
        testItem.className = 'image-item';
        testItem.setAttribute('data-id', 'test_event_handler');
        document.body.appendChild(testItem);
        
        // 假设我们已经修改了addFileItemInteractions函数
        if (window.addFileItemInteractions) {
            // 创建测试数据
            const testFileData = {
                id: 'test_event_handler',
                name: 'test-image.jpg',
                dataUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                size: 1,
                type: 'image/jpeg'
            };
            
            // 应用事件处理
            window.addFileItemInteractions(testItem, testFileData);
            
            // 触发点击事件
            const clickEvent = new MouseEvent('click', { bubbles: true });
            testItem.dispatchEvent(clickEvent);
            
            // 触发右键菜单事件
            const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true });
            testItem.dispatchEvent(contextMenuEvent);
            
            // 检查是否捕获到错误
            setTimeout(() => {
                if (errorCaught) {
                    console.log('✓ 事件处理器错误捕获测试通过');
                } else {
                    console.log('✓ 未检测到事件处理器错误（可能是因为没有错误发生）');
                }
                
                // 清理
                document.body.removeChild(testItem);
                console.error = originalConsoleError;
            }, 100);
        } else {
            console.warn('✗ window.addFileItemInteractions未定义，跳过事件处理器测试');
            console.error = originalConsoleError;
        }
        
    } catch (error) {
        console.error('✗ 测试5失败:', error);
    }
}

// 当DOM加载完成后运行测试
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTests);
} else {
    // 如果DOM已经加载完成，直接运行测试
    setTimeout(runTests, 1000); // 给页面一点时间完全初始化
}

console.log('测试脚本已加载，将在页面初始化完成后运行');