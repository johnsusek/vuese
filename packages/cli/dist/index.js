'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var cac = _interopDefault(require('cac'));
var JoyCon = _interopDefault(require('joycon'));
var fs = _interopDefault(require('fs-extra'));
var Log = _interopDefault(require('log-horizon'));
var events = require('events');
var path = _interopDefault(require('path'));
var carlo = _interopDefault(require('carlo'));
var markded = _interopDefault(require('marked'));
var Prism = _interopDefault(require('prismjs'));
var loadLanguages = _interopDefault(require('prismjs/components'));
var fg = _interopDefault(require('fast-glob'));
var parser = require('@vuese/parser');
var Render = _interopDefault(require('@vuese/markdown-render'));
var chokidar = _interopDefault(require('chokidar'));
var sao = _interopDefault(require('sao'));
var getPort = _interopDefault(require('get-port'));
var open = _interopDefault(require('open'));

/**
 * Copy from https://github.com/djyde/koy
 * Modified by HcySunYang
 */
function parse(content) {
    markded.setOptions({
        highlight: function (code, lang) {
            if (!Prism.languages[lang]) {
                loadLanguages([lang]);
            }
            const c = Prism.highlight(code, Prism.languages[lang], lang);
            return c;
        }
    });
    return markded(content);
}

/* eslint-disable prefer-const */
const logger = Log.create();
var genMarkdown = async (config) => {
    let { include, exclude, outDir, markdownDir, markdownFile, babelParserPlugins, isPreview, genType, keepFolderStructure } = config;
    if (!isPreview)
        logger.progress('Start creating markdown files...');
    if (typeof include === 'string')
        include = [include];
    if (typeof exclude === 'string')
        exclude = [exclude];
    exclude = exclude.concat('node_modules/**/*.(vue|js)');
    const files = await fg(include.concat(exclude.map(p => `!${p}`)));
    return files.map(async (p) => {
        const abs = path.resolve(p);
        const source = await fs.readFile(abs, 'utf-8');
        try {
            const parserRes = parser.parser(source, {
                babelParserPlugins,
                basedir: path.dirname(abs),
                jsFile: abs.endsWith('.js')
            });
            const r = new Render(parserRes);
            const markdownRes = r.renderMarkdown();
            if (!markdownRes)
                return;
            let str = markdownRes.content;
            const compName = markdownRes.componentName
                ? markdownRes.componentName
                : path.basename(abs, '.vue');
            const groupName = markdownRes.groupName;
            str = str.replace(/\[name\]/g, compName);
            let targetDir = '';
            let targetFile = '';
            if (genType === 'markdown' && markdownDir === '*') {
                targetDir = path.dirname(abs);
                targetFile = markdownFile || compName;
            }
            else {
                targetDir = path.resolve(outDir, markdownDir === '*' ? 'components' : markdownDir);
                targetFile = compName;
            }
            const folderStructureMiddlePath = keepFolderStructure
                ? getGlobPatternMatchPath(include, path.dirname(p))
                : '';
            const target = path.resolve(targetDir, folderStructureMiddlePath, targetFile + '.md');
            if (!isPreview) {
                await fs.ensureDir(path.resolve(targetDir, folderStructureMiddlePath));
                await fs.writeFile(target, str);
                logger.success(`Successfully created: ${target}`);
            }
            return {
                compName,
                groupName,
                content: str
            };
        }
        catch (e) {
            logger.error(`The error occurred when processing: ${abs}`);
            logger.error(e);
        }
    });
};
function getGlobPatternMatchPath(globPatternList, targetPath) {
    let index = Infinity;
    let res = '';
    for (let i = 0; i < globPatternList.length; i++) {
        let ep = explicitPrefix(globPatternList[i]);
        if (targetPath.startsWith(ep) && ep.length < index) {
            index = ep.length;
            res = ep;
        }
    }
    res = targetPath.slice(res.length);
    return res[0] === '/' ? res.slice(1) : res;
}
function explicitPrefix(pattern) {
    let patternList = pattern.split('/');
    let resi = 0;
    while (patternList[resi] && patternList[resi] !== '**') {
        resi++;
    }
    return patternList.slice(0, resi).join('/');
}

const logger$1 = Log.create();
var preview = async (config) => {
    const sfc = config.include;
    if (!sfc) {
        logger$1.error('Must provide the path to the .vue file.');
        process.exit(1);
    }
    const vueFile = path.resolve(sfc);
    if (fs.existsSync(vueFile)) {
        async function generate() {
            const componentsPromise = await genMarkdown(config);
            const componentsRes = await Promise.all(componentsPromise);
            const content = componentsRes
                .filter(_ => _)
                .map((res) => res.content)[0];
            return parse(content);
        }
        const app = await carlo.launch();
        app.on('exit', () => process.exit());
        app.serveFolder(__dirname + '/templates/preview');
        class Events extends events.EventEmitter {
        }
        const event = new Events();
        await app.exposeFunction('event', () => event);
        await app.exposeFunction('generate', async () => {
            return await generate();
        });
        await app.load('index.html');
        chokidar
            .watch(vueFile, {
            ignoreInitial: true
        })
            .on('change', () => {
            event.emit('update');
        });
    }
};

const logger$2 = Log.create();
var genDocute = async (config) => {
    try {
        const componentsPromise = await genMarkdown(config);
        const componentRes = await Promise.all(componentsPromise);
        const components = componentRes.filter(_ => _);
        logger$2.progress('Start generating...');
        await sao({
            template: path.resolve(__dirname, './templates/docute'),
            targetPath: path.resolve(config.outDir),
            configOptions: {
                components,
                title: config.title,
                markdownDir: config.markdownDir
            }
        });
        logger$2.success('Generated successfully');
    }
    catch (err) {
        console.error(err.name === 'SAOError' ? err.message : err.stack);
        process.exit(1);
    }
};

/* eslint-disable @typescript-eslint/no-var-requires */
const logger$3 = Log.create();
function getFirstPath(config) {
    const entryPath = path.resolve(`${config.outDir}/index.html`);
    const reg = /(?:[\s\S]+)sidebar\:([\s\S]+)\}\)/;
    const entrySourceStr = fs.readFileSync(entryPath, 'utf-8') || '';
    try {
        const regRes = entrySourceStr.match(reg)[1];
        const routesConfig = new Function(`return ${regRes}`)();
        const firstRoute = routesConfig.reduce((p, v, i) => {
            if (i === 0) {
                const { links } = v;
                return links[0] && links[0].link;
            }
        }, '');
        // Read the first preview configuration injected when opening the browser.
        return `#${firstRoute}`;
    }
    catch (e) {
        // If there's an error, follow the previous logic.
        return '';
    }
}
var server = async (config) => {
    const http = require('http');
    const handler = require('serve-handler');
    const server = http.createServer((req, res) => {
        return handler(req, res, {
            public: path.resolve(config.outDir)
        });
    });
    const port = config.port || (await getPort({ port: 5000 }));
    server.listen(port, config.host, () => {
        const addr = `http://${config.host}:${port}/${getFirstPath(config)}`;
        logger$3.success(`Server running at ${addr}`);
        if (config.open)
            open(addr);
    });
};

// Gotta fix after https://github.com/tabrindle/envinfo/pull/105 gets merged (type-definitions)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const envinfo = require('envinfo');
const logger$4 = Log.create();
const cli = cac();
const joycon = new JoyCon({
    packageKey: 'vuese'
});
joycon.addLoader({
    test: /\.vueserc$/,
    async load(filePath) {
        const source = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(source);
    }
});
async function getConfig(flags) {
    const { path: path$$1, data } = await joycon.load([
        'vuese.config.js',
        '.vueserc',
        'package.json'
    ]);
    const config = {
        genType: 'docute',
        title: 'Components',
        include: '**/*.vue',
        exclude: [],
        outDir: 'website',
        markdownDir: 'components',
        markdownFile: '',
        host: '127.0.0.1',
        keepFolderStructure: false
    };
    if (path$$1)
        Object.assign(config, data, flags);
    Object.assign(config, flags || {});
    return config;
}
cli.command('').action(() => {
    cli.outputHelp();
});
cli
    .command('preview [file]', 'Preview a vue component as a document')
    .example('vuese preview path-to-the-component.vue')
    .action(async (file, flags) => {
    if (!file) {
        logger$4.error('Missing component path.');
        cli.outputHelp();
    }
    const config = await getConfig(flags);
    config.include = file;
    config.isPreview = true;
    preview(config);
});
cli
    .command('gen', 'Generate target resources')
    .option('-k, --keepFolderStructure', 'keep original folder structure')
    .allowUnknownOptions()
    .action(async (flags) => {
    const config = await getConfig(flags);
    if (!['docute', 'markdown'].includes(config.genType)) {
        logger$4.error(`Please provide the correct genType: ${config.genType}`);
    }
    if (config.genType === 'docute')
        genDocute(config);
    else if (config.genType === 'markdown')
        genMarkdown(config);
});
cli
    .command('serve', 'Serve generated docute website')
    .option('--open', 'Open the browser automatically')
    .option('--host [host]', 'Host name')
    .option('--port [port]', 'The port number')
    .allowUnknownOptions()
    .action(async (flags) => {
    const config = await getConfig(flags);
    server(config);
});
cli
    .command('info', 'Show debugging information concerning the local environment')
    .action(async () => {
    logger$4.log('\nEnvironment Info:');
    const data = await envinfo.run({
        System: ['OS', 'CPU'],
        Binaries: ['Node', 'Yarn', 'npm'],
        Browsers: ['Chrome', 'Edge', 'Firefox', 'Safari'],
        npmGlobalPackages: ['vuese']
    });
    logger$4.log(data);
});
cli.version(require('../package.json').version);
cli.help();
cli.parse();
