# uTorrent 自动屏蔽迅雷脚本 (Xunlei Blocker of uTorrent)

<p align='center'>
    <img src='./icon.svg' alt='utorrent-block-xunlei icon' width='96'>
</p>

<h2 align='center'>
    uTorrent 自动屏蔽迅雷脚本
</h2>
<h3 align='center'>
    Xunlei Blocker of uTorrent
</h3>

<p align='center'>
    <a href='https://www.npmjs.com/package/utorrent-block-xunlei' target='_blank'>
        <img alt='npm version' src='https://img.shields.io/npm/v/utorrent-block-xunlei.svg?style=flat-square&color=brightgreen' />
    </a>
    <a href='https://www.npmjs.com/package/utorrent-block-xunlei' target='_blank'>
        <img alt='npm downloads' src='https://img.shields.io/npm/dt/utorrent-block-xunlei?style=flat-square&color=brightgreen' />
    </a>
</p>

## 中文 | [English](./README.en.md)

## 功能
### 每隔 30 秒，自动检查 uTorrent 已连接的用户列表，找出迅雷客户端，强制断开，不给吸血雷上传任何数据，并将用户 IP 加入黑名单阻止其再次连接，把带宽留给正规 BT 客户端

- `utorrent.ts` 支持 IP 定位，可根据地理位置屏蔽 peers

- `resume-data.ts` 批量可编程式修改 uTorrent 的 resume.dat 内保存的任务信息，从而:
    - 在任务或下载文件丢失后，通过修改 resume.dat 跳过文件强制检查，继续做种
    - 可以批量修改本地文件的路径和文件名，并建立到原有种子文件内文件信息的映射，保持继续做种的能力
    - 批量重命名任务，恢复上传量、下载量
    - 提供 API 修改 resume.dat 内保存的任何信息

- 命令行监控，实时查看 peers 情况  

- 反吸血屏蔽策略，下载时对有上传流量的 peers 放宽处理，如下
    ```ts
    this.should_block = this.torrent.state[0] === '做种' ?
        /-XL0012-|Xunlei|^7\.|aria2|Xfplay|dandanplay|FDM|go\.torrent|Mozilla/i.test(this.client) && this.upload_speed > 10 * 2 ** 10
    : this.torrent.state[0] === '下载' ?
        /-XL0012-|Xunlei|^7\.|aria2|Xfplay|dandanplay|FDM|go\.torrent|Mozilla/i.test(this.client) && this.uploaded > this.downloaded * 10 + 5 * 2**20
    :
        false
    ```

## 预览
### 命令行监控
![命令行监控](./preview/monitor-1.png)
![](./preview/monitor-2.png)

### resume.dat 解析及文件重定向
![resume.dat 解析及文件重定向](./preview/resume-dat-1.png)


## 屏蔽列表
### 完全屏蔽
-XL0012-***  
Xunlei/***  
7.x.x.x
### 反吸血屏蔽 (下载量超过上传量的两倍时屏蔽)
Xfplay  
FDM  
dandanplay  
Mozilla  
go.torrent


## 屏蔽算法
1. 根据 uTorrent 的 WebUI API 发送 HTTP 请求，获取所有已连接用户 (peers) 信息
2. 按照用户 (peer) 的客户端名称 (client) 筛选出使用迅雷的用户，将 IP 写入 ipfilter.dat 文件
3. 发送 HTTP 请求让 uTorrent 重新加载 ipfilter.dat
4. uTorrent 禁止 ipfilter.dat 中的 IP 连接

## 使用方法
1. 确保 uTorrent 已开启 WebUI (网页界面)
    1.1 打开 uTorrent 设置 > 高级 > 网页界面
    1.2 选上 "启用网页界面", 并在下方填写用户和密码, 记下来, 作为命令行 username 和 password 参数的值
2. 在 uTorrent 安装目录下保证 ipfilter.dat 文件存在（若不存在则新建空白 ipfilter.dat 文件），脚本会在原有 ipfilter.dat 文件内容之后添加被屏蔽的迅雷 IP，不影响已有内容及其功能
4. [下载压缩包并解压](https://github.com/ShenHongFei/utorrent-block-xunlei/releases/download/v1.0/uTorrentBlockXunlei.zip)  


4. (可选，不影响屏蔽功能) 在 uTorrent 中开启屏蔽日志，查看被屏蔽的连接请求
    4.1 在 uTorrent 下方的日志面板中点击右键
    4.2 勾选 `记录用户通讯信息 > 记录拦截连接`
    4.3 有被屏蔽的用户连接时可以在 uTorrent 日志面板中看到类似下面的日志
```text
[2018-11-22 19:03:43]  Loaded ipfilter.dat (51 entries)
[2018-11-22 19:03:46]  IpFilter blocked peer 223.81.192.235
[2018-11-22 19:03:49]  IpFilter blocked peer 223.81.192.235
[2018-11-22 19:04:06]  IpFilter blocked peer 223.81.192.235
[2018-11-22 19:04:21]  IpFilter blocked peer 183.25.54.216
[2018-11-22 19:04:46]  IpFilter blocked peer 223.81.192.235
...
```

## API
```ts
let utorrent = await UTorrent.connect({
    root_url: 'http://127.0.0.1:1000/gui/',
    username: 'xxx',
    password: 'xxxxxxxx',
    ipfilter_dat: 'C:/Users/xxx/AppData/Roaming/uTorrent/ipfilter.dat',
    interval: 20 * 1000,
    print: {
        torrents: '所有',
        peers: true
    }
})

utorrent.start_blocking()

utorrent.hide_display()

utorrent.show_display()

utorrent.stop_blocking()

utorrent.reset_ipfilter()

utorrent.block_peers()

utorrent.print_blockeds()

utorrent.state
```

## 相关项目
- Python 命令行工具 ban-peers: [https://github.com/SeaHOH/ban-peers](https://github.com/SeaHOH/ban-peers)
- Python 脚本实现: [https://github.com/yefengo/utorrent-block-xunlei](https://github.com/yefengo/utorrent-block-xunlei)
- qBittorrent-Enhanced-Edition: [https://github.com/c0re100/qBittorrent-Enhanced-Edition](https://github.com/c0re100/qBittorrent-Enhanced-Edition)
