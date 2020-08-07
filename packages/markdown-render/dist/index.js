'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function genMarkdownTpl (parserRes) {
    const desc = parserRes.componentDesc;
    let templateStr = '# [name]\n\n';
    if (desc && desc.default.length) {
        templateStr += `${desc.default.join(' ')}\n\n`;
    }
    const forceGenerate = desc && desc.vuese && parserRes.name;
    const original = templateStr;
    templateStr += parserRes.props ? genBaseTemplate('props') : '';
    templateStr += parserRes.events ? genBaseTemplate('events') : '';
    templateStr += parserRes.slots ? genBaseTemplate('slots') : '';
    templateStr += parserRes.methods ? genBaseTemplate('methods') : '';
    templateStr += parserRes.computed ? genBaseTemplate('computed') : '';
    templateStr += parserRes.mixIns ? genBaseTemplate('mixIns') : '';
    templateStr += parserRes.data ? genBaseTemplate('data') : '';
    templateStr += parserRes.watch ? genBaseTemplate('watch') : '';
    templateStr += parserRes.extraDocs ? parserRes.extraDocs : '';
    return !forceGenerate && original === templateStr ? '' : templateStr;
}
function genBaseTemplate(label) {
    let str = `## ${upper(label)}\n\n`;
    str += `<!-- @vuese:[name]:${label}:start -->\n`;
    str += `<!-- @vuese:[name]:${label}:end -->\n\n`;
    return str;
}
function upper(word) {
    return word[0].toUpperCase() + word.slice(1);
}

const nameRE = /\[name\]/g;
const htmlCommentRE = /<!--\s*@vuese:([a-zA-Z_][\w\-\.]*|\[name\]):(\w+):start\s*-->[^]*<!--\s*@vuese:\1:\2:end\s*-->/;
function renderMarkdown (renderRes, parserRes) {
    const mdTemplate = genMarkdownTpl(parserRes);
    // Indicates that this component has no documentable content
    if (!mdTemplate)
        return null;
    let str = mdTemplate;
    const compName = parserRes.name;
    const groupName = parserRes.componentDesc && parserRes.componentDesc.group
        ? parserRes.componentDesc.group[0]
        : undefined;
    if (compName) {
        str = mdTemplate.replace(nameRE, compName);
    }
    let index = 0, stream = str;
    while (stream) {
        const res = stream.match(htmlCommentRE);
        if (res) {
            const matchText = res[0];
            const type = res[2];
            const i = stream.indexOf(matchText);
            const currentHtmlCommentRE = new RegExp(`<!--\\s*@vuese:(${compName ? compName : '\\[name\\]'}):(${type}):start\\s*-->[^]*<!--\\s*@vuese:\\1:\\2:end\\s*-->`);
            str = str.replace(currentHtmlCommentRE, (s, c1, c2) => {
                if (renderRes[type]) {
                    let code = `<!-- @vuese:${c1}:${c2}:start -->\n`;
                    code += renderRes[type];
                    code += `\n<!-- @vuese:${c1}:${c2}:end -->\n`;
                    return code;
                }
                return s;
            });
            index = i + matchText.length;
        }
        else {
            index = stream.length;
        }
        stream = stream.slice(index);
    }
    return {
        content: str,
        componentName: compName || '',
        groupName: groupName || 'BASIC'
    };
}

class Render {
    constructor(parserResult, options) {
        this.parserResult = parserResult;
        this.options = options;
        this.options = Object.assign({}, {
            props: ['Name', 'Description', 'Type', 'Required', 'Default'],
            events: ['Event Name', 'Description', 'Parameters'],
            slots: ['Name', 'Description', 'Default Slot Content'],
            methods: ['Method', 'Description', 'Parameters'],
            computed: ['Computed', 'Type', 'Description', 'From Store'],
            mixIns: ['MixIn'],
            data: ['Name', 'Type', 'Description', 'Default'],
            watch: ['Name', 'Description', 'Parameters']
        }, this.options);
    }
    render() {
        const { props, slots, events, methods, mixIns, data, computed, watch } = this.parserResult;
        const md = {};
        if (props) {
            md.props = this.propRender(props);
        }
        if (slots) {
            md.slots = this.slotRender(slots);
        }
        if (events) {
            md.events = this.eventRender(events);
        }
        if (methods) {
            md.methods = this.methodRender(methods);
        }
        if (computed) {
            md.computed = this.computedRender(computed);
        }
        if (mixIns) {
            md.mixIns = this.mixInRender(mixIns);
        }
        if (data) {
            md.data = this.dataRender(data);
        }
        if (watch) {
            md.watch = this.watchRender(watch);
        }
        return md;
    }
    propRender(propsRes) {
        const propConfig = this.options.props;
        let code = this.renderTabelHeader(propConfig);
        propsRes.forEach((prop) => {
            const row = [];
            for (let i = 0; i < propConfig.length; i++) {
                if (propConfig[i] === 'Name') {
                    row.push(prop.name);
                }
                else if (propConfig[i] === 'Description') {
                    let desc = ['-'];
                    if (prop.describe && prop.describe.length) {
                        desc = prop.describe;
                        if (prop.validatorDesc) {
                            desc = prop.describe.concat(prop.validatorDesc);
                        }
                    }
                    row.push(desc.join(' '));
                }
                else if (propConfig[i] === 'Type') {
                    if (prop.typeDesc) {
                        row.push(prop.typeDesc.join(' '));
                    }
                    else if (!prop.type) {
                        row.push('—');
                    }
                    else if (typeof prop.type === 'string') {
                        row.push(`\`${prop.type}\``);
                    }
                    else if (Array.isArray(prop.type)) {
                        row.push(prop.type
                            .map(t => `\`${t}\` / `)
                            .join(' ')
                            .slice(0, -3));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (propConfig[i] === 'Required') {
                    if (typeof prop.required === 'undefined') {
                        row.push('`false`');
                    }
                    else if (typeof prop.required === 'boolean') {
                        row.push(`\`${String(prop.required)}\``);
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (propConfig[i] === 'Default') {
                    if (prop.defaultDesc) {
                        row.push(prop.defaultDesc.join(' '));
                    }
                    else if (prop.default) {
                        row.push(typeof prop.default === 'object'
                            ? JSON.stringify(prop.default)
                            : prop.default);
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    slotRender(slotsRes) {
        const slotConfig = this.options.slots;
        let code = this.renderTabelHeader(slotConfig);
        // If the template and script contain slots with the same name,
        // only the slots in the template are rendered
        const slotInTemplate = [];
        const slotInScript = [];
        slotsRes.forEach((slot) => {
            slot.target === 'template'
                ? slotInTemplate.push(slot)
                : slotInScript.push(slot);
        });
        slotsRes = slotInTemplate.concat(slotInScript.filter(ss => {
            for (let i = 0; i < slotInTemplate.length; i++) {
                if (ss.name === slotInTemplate[i].name)
                    return false;
            }
            return true;
        }));
        slotsRes.forEach((slot) => {
            const row = [];
            for (let i = 0; i < slotConfig.length; i++) {
                if (slotConfig[i] === 'Name') {
                    row.push(slot.name);
                }
                else if (slotConfig[i] === 'Description') {
                    if (slot.describe) {
                        row.push(slot.describe);
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (slotConfig[i] === 'Default Slot Content') {
                    if (slot.backerDesc) {
                        row.push(slot.backerDesc);
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    eventRender(propsRes) {
        const eventConfig = this.options.events;
        let code = this.renderTabelHeader(eventConfig);
        propsRes.forEach((event) => {
            const row = [];
            for (let i = 0; i < eventConfig.length; i++) {
                if (eventConfig[i] === 'Event Name') {
                    row.push(event.name);
                }
                else if (eventConfig[i] === 'Description') {
                    if (event.describe && event.describe.length) {
                        row.push(event.describe.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (eventConfig[i] === 'Parameters') {
                    if (event.argumentsDesc) {
                        row.push(event.argumentsDesc.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    methodRender(methodsRes) {
        const methodConfig = this.options.methods;
        let code = this.renderTabelHeader(methodConfig);
        methodsRes.forEach((method) => {
            const row = [];
            for (let i = 0; i < methodConfig.length; i++) {
                if (methodConfig[i] === 'Method') {
                    row.push(method.name);
                }
                else if (methodConfig[i] === 'Description') {
                    if (method.describe) {
                        row.push(method.describe.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (methodConfig[i] === 'Parameters') {
                    if (method.argumentsDesc) {
                        row.push(method.argumentsDesc.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    computedRender(computedRes) {
        const computedConfig = this.options.computed;
        let code = this.renderTabelHeader(computedConfig);
        computedRes.forEach((computed) => {
            const row = [];
            for (let i = 0; i < computedConfig.length; i++) {
                if (computedConfig[i] === 'Computed') {
                    row.push(computed.name);
                }
                else if (computedConfig[i] === 'Type') {
                    if (computed.type) {
                        row.push(`\`${computed.type.join(' ')}\``);
                        row.push();
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (computedConfig[i] === 'Description') {
                    if (computed.describe) {
                        row.push(computed.describe.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (computedConfig[i] === 'From Store') {
                    if (computed.isFromStore) {
                        row.push('Yes');
                    }
                    else {
                        row.push('No');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    mixInRender(mixInsRes) {
        const mixInsConfig = this.options.mixIns;
        let code = this.renderTabelHeader(mixInsConfig);
        mixInsRes.forEach((mixIn) => {
            const row = [];
            for (let i = 0; i < mixInsConfig.length; i++) {
                if (mixInsConfig[i] === 'MixIn') {
                    row.push(mixIn.mixIn);
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    dataRender(dataRes) {
        const dataConfig = this.options.data;
        let code = this.renderTabelHeader(dataConfig);
        dataRes.forEach((data) => {
            const row = [];
            for (let i = 0; i < dataConfig.length; i++) {
                if (dataConfig[i] === 'Name') {
                    row.push(data.name);
                }
                else if (dataConfig[i] === 'Description') {
                    if (data.describe) {
                        row.push(data.describe.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (dataConfig[i] === 'Type') {
                    if (data.type.length > 0) {
                        row.push(`\`${data.type}\``);
                    }
                    else {
                        row.push('—');
                    }
                }
                else if (dataConfig[i] === 'Default') {
                    if (data.default) {
                        row.push(data.default);
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    watchRender(watchRes) {
        const watchConfig = this.options.watch;
        let code = this.renderTabelHeader(watchConfig);
        watchRes.forEach((watch) => {
            const row = [];
            for (let i = 0; i < watchConfig.length; i++) {
                if (watchConfig[i] === 'Name') {
                    row.push(watch.name);
                }
                else if (watchConfig[i] === 'Description') {
                    if (watch.describe) {
                        row.push(watch.describe.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else if (watchConfig[i] === 'Parameters') {
                    if (watch.argumentsDesc) {
                        row.push(watch.argumentsDesc.join(' '));
                    }
                    else {
                        row.push('-');
                    }
                }
                else {
                    row.push('-');
                }
            }
            code += this.renderTabelRow(row);
        });
        return code;
    }
    renderTabelHeader(header) {
        const headerString = this.renderTabelRow(header);
        const splitLine = this.renderSplitLine(header.length);
        return headerString + splitLine + '\n';
    }
    renderTabelRow(row) {
        return row.map(n => `|${n}`).join('') + '|\n';
    }
    renderSplitLine(num) {
        let line = '';
        for (let i = 0; i < num; i++) {
            line += '|---';
        }
        return line + '|';
    }
    renderMarkdown() {
        return renderMarkdown(this.render(), this.parserResult);
    }
}

exports.Render = Render;
exports.default = Render;
