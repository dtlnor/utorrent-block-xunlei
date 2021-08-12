import bencode from 'bencode'
import omit from 'lodash/omit.js'
import sort_by from 'lodash/sortBy.js'

import { fread, frename, fwrite, fmove, inspect, flist } from 'xshell'


export class TorrentData {
    fp_torrent: string
    
    /** 种子任务名称 */
    caption: string
    
    /** 错误说明，如：任务文件丢失。请重新检查。 */
    dl_error: string
    
    /** 若种子文件只包含一个文件，则 path 为该文件的完整存储路径，  
        否则 path 为文件夹的位置
     */
    path: string
    
    /** 高级 > 设置目标名称  
        文件位置的重定位表，格式为 [index, fp][]，未重定位则无此字段  
        index: 种子文件的文件列表所对应的文件序号 (从 0 开始编号)  
        fp:    文件重定位后的相对 path 的路径  
        
        比如：  
        0  : 1.mkv  
        2  : 3.mkv  
        351: SPs/24-blabla.mkv
    */
    targets?: [number, string][]
    
    downloaded: number
    
    uploaded: number
    
    blocksize: number
    
    trackers: string[]
    
    labels: string[]
    
    started: number
    
    valid: number
    
    have: Buffer
    
    hashed: Buffer
    
    known: Buffer
    
    [key: string]: any
    
    
    constructor (fp_torrent: string, data: any) {
        this.fp_torrent = fp_torrent.to_slash()
        
        Object.entries(data).forEach( ([ key, value ]) => {
            if (key === 'caption' || key === 'dl_error') {
                this[key] = ( value as Buffer ).toString()
                return
            }
            
            if (key === 'trackers' || key === 'labels') {
                this[key] = ( value as Buffer[] ).map( buf => buf.toString() )
                return
            }
            
            if (key === 'targets') {
                this[key] = ( value as [number, Buffer][] ).map( ([index, fp]) => ([ index, fp.toString().to_slash() ]) )
                return
            }
            
            if (key === 'path') {
                this[key] = ( value as Buffer ).toString().to_slash()
                return
            }
            
            this[key] = value
        })
    }
    
    
    to_str () {
        const title_width = 14
        return `${this.caption}\n` + [
            `${'种子:'.pad(title_width)     }${this.fp_torrent}`,
            `${'文件夹:'.pad(title_width)   }${this.path}`,
            `${'标签:'.pad(title_width)     }${this.labels.join(', ')}`,
            `${'已下载:'.pad(title_width)   }${this.downloaded.to_fsize_str()}    ／    已上传: ${this.uploaded.to_fsize_str()}    分块大小: ${this.blocksize.to_fsize_str()}`,
            ... !this.valid ? [
                `${'错误:'.pad(title_width)   }${this.dl_error || ''}`
            ] : [ ],
            
            `${'trackers:'.pad(title_width)}Array<${this.trackers.length}> [${this.trackers.slice(0, 2).join(', ')}]`,
            ... this.targets ? [
                '文件重定位:',
                ... this.targets.map( ([index, fp]) => 
                    `${index}: ${fp}`
                ).indent(2),
            ] : [ ],
        ].indent(2).join_lines()
    }
    
    
    [inspect.custom] () {
        return this.to_str()
    }
    
    
    to_data () {
        const data = omit(this, ['fp_torrent'])
        return {
            ...data,
            ... this.targets  ? { targets: this.targets.map( ([index, fp]) => ([ index, fp.to_backslash() ]) ) }  :  { },
            path: this.path.to_backslash(),
        }
    }
    
    
    relocate_torrent (fp_torrent: string) {
        if (!fp_torrent.fexists) throw new Error(`fp_torrent 文件不存在: ${fp_torrent}`)
        this.fp_torrent = fp_torrent.to_backslash()
    }
    
    
    fix () {
        this.started = 0
        this.valid = 1
        this.have.fill(0xff)
        this.hashed.fill(0xff)
        this.known.fill(0xff)
    }
}


export class TorrentFile {
    info: {
        files?: {
            length: number
            path: string
        }[]
        name: string
        'piece length': number
        pieces: Buffer
    }
    
    private constructor (data: Partial<TorrentFile>) {
        Object.assign(this, data)
    }
    
    static async parse (fp: string) {
        const data = bencode.decode( await fread(fp, { encoding: 'BINARY' }) )
        const files = data.info.files
        return new TorrentFile({
            ...data,
            info: {
                ... data.info,
                ... files  ?  { files: files.map( file => ({ length: file.length, path: file.path.map( (fp: Buffer) => fp.toString()).join('/') }) ) }  :  { }
            }
        })
    }
    
    
    get_fps () {
        return this.info.files.map( file => file.path)
    }
    
    
    [inspect.custom] () {
        return [
            'TorrentFile {',
            ... [
                'files:',
                ... this.get_fps().map( (fp, i) => i.toString().pad(4) + ': ' + fp).indent(2),
                ''
            ].indent(2),
            '}',
        ].join_lines()
    }
}



export class ResumeData {
    fp_resume_dat: string
    
    rec: Buffer
    
    torrents: TorrentData[]
    
    private constructor (data: Partial<ResumeData>) {
        Object.assign(this, data)
    }
    
    static async parse (fp_resume_dat: string) {
        const data = bencode.decode(
            await fread(fp_resume_dat, { encoding: 'BINARY' })
        )
        
        return new ResumeData({
            fp_resume_dat,
            rec: data.rec,
            torrents: sort_by(
                Object.entries(data).filter(([key]) => 
                    key !== 'rec' && key !== '.fileguard'
                ).map(([fp_torrent, data]) => 
                    new TorrentData(fp_torrent, data)
                ),
                'caption'
            )
        })
    }
    
    
    async save (fp: string = this.fp_resume_dat) {
        await fwrite(fp, bencode.encode({
            rec: this.rec,
            ... Object.fromEntries(
                    this.torrents.map( torrent => 
                        ([torrent.fp_torrent.to_backslash(), torrent.to_data()]))
            )
        }))
    }
    
    
    relocate_paths (src: string, dest: string, filter?: (td: TorrentData) => boolean) {
            // const td: TorrentData = this[key]
            // if (filter && !filter(td)) continue
            // const path_ = td.path.replace(src, dest)
            // console.log(td.path, ' → ', path_)
            // td.path = path_
    }
    
    
    /** 根据 pattern 查找首个匹配的种子，不传 pattern 参数时返回最近添加的种子 */
    find_torrent (pattern?: string | RegExp): TorrentData {
        if (!pattern) return sort_by(this.torrents, 'added_on').last
        return this.torrents.find( torrent => torrent.caption.match(pattern) )
    }
    
    find_torrents (pattern: string | RegExp): TorrentData[] {
        return this.torrents.filter( torrent => torrent.caption.match(pattern))
    }
    
    
    [inspect.custom] () {
        return 'ResumeData {\n' +
            [
                `fp_resume_dat: ${this.fp_resume_dat}\n`,
                ... this.torrents.map( torrent => {
                    return [
                        ... torrent.to_str().split_lines(),
                        ''
                    ]
                })
            ].flat().indent(2).join_lines() + '\n' +
        '}'
    }
}


export default ResumeData


async function repl_rename_onepice () {
    const dir = 'G:/ACGN/海贼王/'
    
    // ------------ 选择种子任务
    let resume_data = await ResumeData.parse('C:/Users/shf/AppData/Roaming/uTorrent/resume.dat')
    
    let torrents = sort_by(resume_data.torrents, 'added_on').reverse().slice(0, 5)
    
    let torrent = torrents[0]
    // let torrent = resume_data.get_torrent('[Skytree][海贼王]'.to_regx())
    
    
    // 种子文件
    const fp_torrent = torrent.fp_torrent
    
    // episode
    const episode = torrent.caption.find('[Skytree][海贼王][One_Piece][{episode}][GB_BIG5_JP][X264_AAC][1080P][CRRIP][天空树双语字幕组]').episode
    // episode = 921
    
    // 下载的文件
    const fp_mkv = torrent.path
    
    // 新的种子文件路径
    const fp_torrent_   = `${dir}${episode}.torrent`
    
    // 移动种子文件
    await fmove(fp_torrent, fp_torrent_)
    
    // 移动下载好的 mkv
    await fmove(fp_mkv, `${dir}${episode}.mkv`)
    
    // ------------ 更新任务
    torrent.caption    = `海贼王 ${episode}`
    torrent.fp_torrent = `${dir}${episode}.torrent`
    torrent.path       = `${dir}${episode}.mkv`
    torrent.labels     = ['海贼王']
    
    
    await resume_data.save()
}



async function repl_resume_dat () {
    // 加载数据
    let resume_data = await ResumeData.parse('C:/Users/shf/AppData/Roaming/uTorrent/resume.dat')
    
    
    // ------------ 选择要修改的种子
    let torrents = resume_data.torrents.filter(({ caption, labels }) => labels.includes('电影'))
    
    let torrent = torrents[0]
    
    // let torrents = resume_data.torrents.filter(({ started, labels, targets, caption }) => labels.includes('ACGN') && started === 4 && !targets && caption.includes('Tom'))
    
    // let torrent = torrents[0]
    // let torrent = resume_data.find_torrent('Tom')
    
    
    // 按顺序
    // let torrent     = resume_data.torrents[3]
    
    // 按名称
    // let torrent = resume_data.find_torrent('君の')
    // let torrents = resume_data.find_torrents('〈物語〉シリーズ')
    
    // 最近添加
    // let torrent = sort_by(resume_data.torrents, 'added_on').reverse()[0]
    // let torrents = sort_by(resume_data.torrents, 'added_on').reverse().slice(0, 5)
    
    // 私有种子
    let torrent_pt = sort_by(resume_data.torrents, 'added_on').reverse()[0]
    
    
    // ------------ 指定存放目录及名称
    // 获取当前种子路径等信息
    const { fp_torrent, caption } = torrent
    
    
    // 设置主标题 ( 注意日文空格 '　'.charCodeAt(0) )
    const name = '妹さえいればいい。'
    
    
    // 设置 & 打开 存放目录
    const dir  = `G:/ACGN/${name}/`
    // const dir = 'G:/ACGN/WHITE ALBUM/1.anime/'
    
    
    // 设置版本
    let version = ''
    
    
    // 设置压制信息
    const info = 'BDRip 1080p x265 Ma10p FLAC'
    // const info = 'BDRip 1080p x265 Ma10p FLACx2'
    // const info = 'BDRip 1080p x265 Ma10p FLACx3'
    // const info = 'BDRip 1080p H.265.10bit FLACx2'
    // const info = 'BDRip 1080p x265 Ma10p FLAC+AAC'
    // const info = 'BDRip 1080p H.265 YUV444P10 MKV FLAC Chap'
    // const info = 'BDRip 1080p H.265 YUV420P10 QAAC'
    // const info = 'BDRip 1080p x264 Hi10p FLAC'
    // const info = 'BDRip 1080p H.264 Hi10p FLAC'
    // const info = 'BDRip 1080p H.264 YUV420P10 MKV FLAC'
    // const info = 'BDRip 1080p H.264 FLAC'
    // const info = 'BDRip 1080p x264 8bit FLAC'
    // const info = 'BDRip 1080p x264 Hi10p 2FLAC'
    // const info = 'BDRip 720p x264 Hi10p FLAC'
    // const info = 'BDRip 816p x265 Ma10p FLAC'
    // const info = '1080p MP4'
    // const info = ''
    
    
    // 设置字幕组／来源
    const origin = 'VCB-Studio'
    // const origin = 'DHR & MakariHoshiyume & VCB-Studio'
    // const origin = 'Snow-Raws'
    
    
    // 生成 caption
    const caption_ = name + 
        ( version ?  ` ${version.bracket('ROUND')}`  :  '' ) + 
        ( info    ?  ` ${info.bracket('SQUARE')}`    :  '' ) +
        ( origin  ?  ` ${origin.bracket('SQUARE')}`  :  '' )
    
    
    // 生成种子路径
    const fp_torrent_ = `${dir}${caption_}.torrent`
    
    
    // ------------ 保存修改到 torrent
    // 移动种子
    await fmove(fp_torrent, fp_torrent_)
    
    // 修改任务标题
    torrent.caption = caption_
    
    // 修改种子路径
    torrent.fp_torrent = fp_torrent_
    
    // 修改任务文件夹
    torrent.path = dir
    
    // 修改任务标签
    torrent.labels = ['ACGN']
    // torrent.labels = ['电影']
    
    
    
    // 参考原 torrent 中的 files
    // const ftorrent    = await TorrentFile.parse(fp_torrent_)
    const ftorrent    = await TorrentFile.parse(torrent.fp_torrent)
    
    const ftorrent_pt = await TorrentFile.parse(fp_torrent.replace('.torrent', '.pt.torrent'))
    
    
    // 查看种子中的文件列表
    ftorrent.info.files.forEach(({ path }, i) => {
        console.log(`${String(i).pad(3, { character: '0', position: 'left' }).green} ${path}`)
    })
    
    
    // (optional) 修改文件名
    // [[58, 'BDRips/01.mkv'], [59, 'BDRips/01.sc.ass'], ... ]
    torrent.targets =
        [
            ... ftorrent.get_fps().slice(58).map( (fp, index) => 
                ([58 + index, fp.refmt(
                    '[VCB-S]Hanamonogatari[1080p]/{any}',
                    '花物語/{any}',
                )])),
            
        ] as [number, string][]
        
    let fps = await flist('G:/ACGN/猫和老鼠/', { absolute: false })
    
    fps = fps.slice(37)
    torrent.targets = fps.map((fp, i) => ([37 + i, fp]))
    
    // (optional) 重命名文件 ①
    await Promise.all([
        ftorrent.get_fps().slice(0, 37).map( async (fp, index) => {
            const fp_ = fp.refmt(
                'TOM AND JERRY EP{episode} {title}.mkv',
                '{episode}   {title}.mkv',
            )
            // console.log(fp_)
            await frename(fp, fp_, { dir })
        })
    ])
    
    
    // (optional) 重命名文件 ②
    const text = '' // paste()
    await Promise.all([
        text.split_lines().trim_lines().map( async fp => {
            const fp_ = fp.refmt(
                '{episode}   {title}.mkv',
                '0{episode}   {title}.mkv',
            )
            // console.log(fp_)
            await frename(fp, fp_, { dir })
        })
    ])
    
    
    // (optional) 应用到 .pt.torrent
    torrent_pt.caption      = torrent.caption + '.pt'
    torrent_pt.fp_torrent   = torrent.fp_torrent.replace('.torrent', '.pt.torrent')
    torrent_pt.path         = torrent.path
    torrent_pt.labels       = torrent.labels
    torrent_pt.targets      = torrent.targets
    
    
    // ------------ 确认修改后的种子
    torrent
    torrent_pt
    
    resume_data
    
    sort_by(resume_data.torrents, 'added_on').reverse().slice(0, 5)
    
    
    // ------------ 保存修改到 resume.dat
    await resume_data.save()
}
