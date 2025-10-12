# LeanCloud 配置指南

本文档将指导您如何使用 LeanCloud 替代 Firebase 实现图片交换应用的跨设备数据同步功能。

## 1. 创建 LeanCloud 应用

如果您还没有 LeanCloud 应用，请按照以下步骤创建：

1. 访问 [LeanCloud 官网](https://console.leancloud.cn/) 并登录
2. 点击「创建应用」按钮
3. 填写应用名称，选择「开发版」或「标准版」，点击「创建」

## 2. 获取应用凭证

以下是获取 App ID、App Key 和 Server URL 的详细步骤：

1. 访问 [LeanCloud 官网](https://console.leancloud.cn/) 并登录您的账号
2. 在控制台首页，找到并点击您创建的应用名称进入应用详情页
3. 在应用详情页的左侧导航栏中，点击「设置」菜单（通常位于底部）
4. 在「设置」下拉菜单中，点击「应用凭证」选项
5. 在「应用凭证」页面中，您将看到以下关键信息：
   - **App ID**: 一串以字母开头的字符串（例如：`VbfV1mFYBGUNtUKD0cr1qUls-gzGzoHsz`）
   - **App Key**: 一串较长的字母数字组合字符串
   - **Server URL**: 一个完整的 URL 地址（例如：`https://vbfv1mfyb.cloud.leancloud.cn`）
6. 点击每个凭证旁边的复制按钮，将它们复制并保存到安全的地方

**注意**：
- App Key 是敏感信息，请妥善保管，不要泄露给他人
- Server URL 通常会根据您选择的区域自动配置好

## 3. 创建数据存储类

1. 进入「存储」-「结构化数据」
2. 点击「创建 Class」按钮
3. 创建一个名为 `ImagePool` 的 Class，类型选择「结构化数据」

## 4. 在 index.html 文件中配置凭证

您已经创建了 LeanCloud 应用并获取了应用凭证，现在需要将这些凭证配置到 index.html 文件中。目前，项目中的 index.html 文件已经包含了 LeanCloud SDK 的引用和初始化代码，但需要您替换其中的 App Key 占位符。

### 4.1 查找并替换 App Key

1. 在您的项目中找到 index.html 文件并打开它
2. 在文件的 `<head>` 标签内，查找以下代码段：

```html
<script>
  // 初始化 LeanCloud
  const APP_ID = 'VbfV1mFYBGUNtUKD0cr1qUls-gzGzoHsz'; // 用户提供的 App ID
  const APP_KEY = '替换为您的App Key'; // 需要用户从 LeanCloud 控制台获取
  const SERVER_URL = 'https://vbfv1mfybgunzukd0cr1quls-gzozohsz.api.lncldglobal.com'; // 根据用户提供的 URL 推断
  
  AV.init({
    appId: APP_ID,
    appKey: APP_KEY,
    serverURL: SERVER_URL
  });
  
  // 创建全局引用
  window.AV = AV;
</script>
```

3. 将 `const APP_KEY = '替换为您的App Key';` 中的 `替换为您的App Key` 替换为您从 LeanCloud 控制台获取的实际 App Key

**注意**：
- App ID 和 Server URL 已经预先配置好了，通常不需要修改
- 确保替换时保持引号的完整性，只替换引号内的文本内容

### 4.1 替换 Firebase SDK 引用为 LeanCloud SDK

删除 Firebase 相关的 script 标签，添加 LeanCloud SDK 引用：

```html
<!-- LeanCloud SDK -->
<script src="https://cdn.jsdelivr.net/npm/leancloud-storage@4.15.3/dist/av-min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/leancloud-realtime@5.0.0/dist/realtime.min.js"></script>
```

### 4.2 初始化 LeanCloud

在 head 部分添加 LeanCloud 初始化代码：

```html
<script>
  // 初始化 LeanCloud
  const APP_ID = '替换为您的App ID';
  const APP_KEY = '替换为您的App Key';
  const SERVER_URL = '替换为您的Server URL';
  
  AV.init({
    appId: APP_ID,
    appKey: APP_KEY,
    serverURL: SERVER_URL
  });
  
  // 创建全局引用
  window.AV = AV;
</script>
```

### 4.3 修改数据操作代码

需要将 Firebase 相关的数据操作代码替换为 LeanCloud 的对应实现。具体修改包括：

1. 数据读取和监听
2. 数据写入和更新
3. 错误处理

## 5. 安全规则设置

为了保护您的数据安全，建议设置适当的安全规则：

1. 进入「存储」-「安全中心」-「数据访问控制」
2. 为 `ImagePool` 类设置合理的读写权限

## 6. 验证配置

完成 App Key 的配置后，您可以通过以下步骤验证配置是否成功：

1. 在本地打开 index.html 文件（可以直接双击文件或使用任何静态文件服务器）
2. 尝试上传一张图片
3. 如果上传成功，并且图片显示在页面上，则说明 LeanCloud 配置基本正常
4. 为了确保跨设备同步功能正常工作，建议在另一个设备上也打开相同的页面，查看是否能看到刚刚上传的图片

**如何确认数据已存储到 LeanCloud？**

您可以登录 LeanCloud 控制台，进入您的应用，然后：

1. 点击左侧菜单的「存储」-「结构化数据」
2. 选择 `ImagePool` 类
3. 如果配置成功，您应该能看到刚刚上传的图片数据记录

## 7. 常见问题排查

- 如果数据不同步，请检查：
  - LeanCloud 初始化参数是否正确
  - 网络连接是否正常
  - 安全规则是否允许读写操作
- 如果出现其他错误，请打开浏览器控制台查看具体错误信息

## 8. 对比 Firebase

相比 Firebase，LeanCloud 的主要优势：

1. 国内访问速度更快，无墙限制
2. 本地化支持更好
3. 更符合国内用户习惯的控制台界面

---

通过以上步骤，您可以成功将应用从 Firebase 迁移到 LeanCloud，实现更稳定的跨设备图片共享功能。