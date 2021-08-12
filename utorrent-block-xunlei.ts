#!/usr/bin/env node

import { program } from 'commander'

import UTorrent from './index.js'
import package_json from './package.json'


(async function main () {
    // const zh = Intl.DateTimeFormat().resolvedOptions().locale.startsWith('zh')
    
    program
        .version(package_json.version)
        .description(package_json.description)
        .usage('--port 50050 --username tom --password 123456 --ipfilter "C:/Users/tom/AppData/Roaming/uTorrent/ipfilter.dat"')
        
        .option('--hostname [hostname]', '选填, uTorrent WebUI 主机的 hostname, 默认为本机 127.0.0.1, 也可设置远程主机 IP 或域名', '127.0.0.1')
        .option('--port <port>', '必填, "uTorrent 设置 > 连接 > 监听端口 > 传入连接所使用的端口" 中设置的端口号')
        
        .option('--username <username>', '必填, "uTorrent 设置 > 高级 > 网页界面 > 身份验证 > 用户" 中设置的用户名')
        .option('--password <password>', '必填, "uTorrent 设置 > 高级 > 网页界面 > 身份验证 > 密码" 中设置的密码')
        
        .option('--ipfilter <ipfilter>', '必填, uTorrent 数据目录中 ipfilter.dat 文件的完整路径，如: C:/Users/tom/AppData/Roaming/uTorrent/ipfilter.dat')
        
        .option('--interval [interval]', '选填, 检测 peers 的间隔（秒）, 默认每隔 20 秒检测并屏蔽一次', '20')
        
    
    program.parse(process.argv)
    
    const { hostname, port, username, password, ipfiler: ipfilter_dat, interval } = program.opts()
    
    let utorrent = await UTorrent.connect({
        root_url: `http://${hostname}:${port}/gui/`,
        username,
        password,
        ipfilter_dat,
        interval: Number(interval) * 1000
    })
    
    utorrent.start_blocking()
})()
