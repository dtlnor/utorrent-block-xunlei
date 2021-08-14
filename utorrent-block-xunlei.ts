#!/usr/bin/env node

import repl from 'repl'

import { program } from 'commander'
import { log_section, delay, fwrite, fread } from 'xshell'

import UTorrent from './index.js'
import package_json from './package.json'

declare global {
    var utorrent: UTorrent
    var exit: () => Promise<void>
}

(async function main () {
    // const zh = Intl.DateTimeFormat().resolvedOptions().locale.startsWith('zh')
    
    program
        .version(package_json.version)
        .description(package_json.description)
        .usage('--port 50050 --username tom --password 123456 --ipfilter "C:/Users/tom/AppData/Roaming/uTorrent/ipfilter.dat"')
        
        .option('--hostname <hostname>', '可选参数, uTorrent WebUI 主机的 hostname, 默认为本机 127.0.0.1, 也可设置远程主机 IP 或域名', '127.0.0.1')
        .requiredOption('--port <port>', '必传参数, "uTorrent 设置 > 连接 > 监听端口 > 传入连接所使用的端口" 中设置的端口号')
        
        .requiredOption('--username <username>', '必传参数, "uTorrent 设置 > 高级 > 网页界面 > 身份验证 > 用户" 中设置的用户名')
        .requiredOption('--password <password>', '必传参数, "uTorrent 设置 > 高级 > 网页界面 > 身份验证 > 密码" 中设置的密码')
        
        .requiredOption('--ipfilter <ipfilter>', '必传参数, uTorrent 数据目录中 ipfilter.dat 文件的完整路径，如: C:/Users/tom/AppData/Roaming/uTorrent/ipfilter.dat')
        
        .option('--interval <interval>', '可选参数, 检测 peers 的间隔（秒）, 默认每隔 20 秒检测并屏蔽一次', '20')
        
        .option('--interval-reset <interval>', '可选参数, 间隔 interval 秒自动重置当前时间间隔内被动态屏蔽的 IP，默认间隔 2 小时', '7200')
        
        .showHelpAfterError()
        
    
    program.parse(process.argv)
    
    const opts = program.opts()
    
    const { hostname, username, password }: { hostname: string, username: string, password: string } = opts as any
    const port = Number(opts.port)
    const fp_ipfilter = (opts.ipfilter as string).to_slash()
    const interval = Number(opts.interval) * 1000
    const interval_reset = Number(opts.intervalReset) * 1000
    
    
    const options = {
        root_url: `http://${hostname}:${port}/gui/`,
        username,
        password,
        fp_ipfilter,
        interval,
        interval_reset,
    }
    
    console.log(options)
    
    let utorrent = await UTorrent.connect(options)
    
    global.utorrent = utorrent
    
    await utorrent.start_blocking()
    
    log_section('started blocking', { time: true, color: 'green' })
    
    async function exit () {
        await utorrent.stop_blocking()
        process.exit()
    }
    
    global.exit = exit
    
    repl.start({
        prompt: '',
        replMode: repl.REPL_MODE_SLOPPY,
        useGlobal: true,
        useColors: true,
        terminal: true,
    })
})()
