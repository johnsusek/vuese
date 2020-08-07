'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var build = require('vue-template-compiler/build');
var parser = require('@babel/parser');
var path = require('path');
var fs = require('fs');
var traverse = require('@babel/traverse');
var traverse__default = _interopDefault(traverse);
var bt = require('@babel/types');
var generate = _interopDefault(require('@babel/generator'));

// Use vue-template-compiler/build to avoid detection of vue versions
function sfcToAST(source, babelParserPlugins, basedir, jsFile) {
    const plugins = getBabelParserPlugins(babelParserPlugins);
    const sfc = build.parseComponent(source);
    const res = { jsSource: '', templateSource: '', docSource: '' };
    if (sfc.script || jsFile) {
        if (sfc.script && (!sfc.script.content && sfc.script.src)) {
            // Src Imports
            if (basedir) {
                try {
                    sfc.script.content = fs.readFileSync(path.resolve(basedir, sfc.script.src), 'utf-8');
                }
                catch (e) {
                    console.error(e);
                    sfc.script.content = '';
                }
            }
        }
        res.jsSource = jsFile ? '' : sfc.script.content || '';
        res.sourceType = jsFile ? 'js' : sfc.script.lang;
        res.jsAst = parser.parse(jsFile ? source : sfc.script.content, {
            sourceType: 'module',
            plugins
        });
    }
    if (sfc.template) {
        if (!sfc.template.content && sfc.template.src) {
            // Src Imports
            if (basedir) {
                try {
                    sfc.template.content = fs.readFileSync(path.resolve(basedir, sfc.template.src), 'utf-8');
                }
                catch (e) {
                    console.error(e);
                    sfc.template.content = '';
                }
            }
        }
        res.templateSource = sfc.template.content || '';
        res.templateAst = build.compile(sfc.template.content, {
            comments: true
        }).ast;
    }
    if (sfc.customBlocks && sfc.customBlocks.length) {
        const docsBlock = sfc.customBlocks.find((block) => block.type === 'docs');
        if (docsBlock) {
            res.docSource = docsBlock.content || '';
        }
    }
    return res;
}
function getBabelParserPlugins(plugins) {
    const defaultBabelParserPlugins = {
        objectRestSpread: true,
        dynamicImport: true,
        'decorators-legacy': true,
        classProperties: true,
        typescript: true,
        jsx: true
    };
    const finallyBabelParserPlugins = Object.assign(defaultBabelParserPlugins, plugins || {});
    return Object.keys(finallyBabelParserPlugins).filter((k) => finallyBabelParserPlugins[k]);
}

const commentRE = /\s*\*\s{1}/g;
const leadRE = /^@(\w+)\b/;
/**
 * @param cnode {bt.Node} a node with comments
 * @param trailing {boolean} Whether to process the tailing comment
 */
function getComments(cnode, trailing) {
    const res = {
        default: []
    };
    const commentNodes = trailing
        ? cnode.trailingComments || []
        : cnode.leadingComments || [];
    if (!commentNodes || !commentNodes.length)
        return res;
    let comments = '', matchs, codeBlockStarted;
    commentNodes.forEach((node) => {
        if (isCommentLine(node)) {
            if (isCodeBlockDeclaration(node.value) && codeBlockStarted)
                codeBlockStarted = false;
            comments = codeBlockStarted
                ? node.value.replace(/^\s/, '')
                : node.value.trim();
            if (isCodeBlockDeclaration(node.value) &&
                typeof codeBlockStarted === 'undefined')
                codeBlockStarted = true;
            matchs = comments.match(leadRE);
            if (matchs) {
                const key = matchs[1];
                res[key] = res[key] || [];
                res[key].push(comments.replace(leadRE, '').trim());
            }
            else {
                res.default.push(comments);
            }
        }
        else if (isCommentBlock(node)) {
            comments = node.value
                .replace(commentRE, '\n')
                .replace(/^\*/, '')
                .split('\n');
            comments = filterBlockComments(comments);
            let currentKey = 'default';
            comments.forEach(c => {
                if ((matchs = c.match(leadRE))) {
                    currentKey = matchs[1];
                    res[currentKey] = res[currentKey] || [];
                    res[currentKey].push(c.replace(leadRE, '').trim());
                }
                else {
                    res.default.push(c);
                }
            });
        }
    });
    Object.keys(res).forEach(k => {
        res[k] = res[k].filter(comment => !comment.includes('eslint-disable'));
    });
    return res;
}
/**
 * Extract the leading comments of the default export statement
 * 1、If the default export is a class with a decorator,
 *    we should find the trailing comments of the last decorator node.
 * 2、In other cases, directly use the leading commets of the default export statement.
 */
function getComponentDescribe(node) {
    let res = {
        default: []
    };
    if (bt.isClassDeclaration(node.declaration)) {
        const decorators = node.declaration.decorators;
        if (decorators && decorators.length) {
            res = getComments(decorators[decorators.length - 1], true /* trailing */);
        }
    }
    else {
        res = getComments(node);
    }
    return res;
}
function isCommentLine(node) {
    return node.type === 'CommentLine';
}
function isCommentBlock(node) {
    return node.type === 'CommentBlock';
}
function isCodeBlockDeclaration(value) {
    return value.includes('```');
}
function filterBlockComments(comments) {
    let codeBlockStarted;
    return comments
        .map(t => {
        if (isCodeBlockDeclaration(t) && codeBlockStarted)
            codeBlockStarted = false;
        const res = codeBlockStarted ? t : t.trim();
        if (isCodeBlockDeclaration(t) && typeof codeBlockStarted === 'undefined')
            codeBlockStarted = true;
        return res;
    })
        .filter(t => t);
}

/**
 * If a node satisfies the following conditions, then we will use this node as a Vue component.
 * 1. It is a default export
 * 2. others...
 */
function isVueComponent(path$$1, componentLevel) {
    const node = path$$1.node;
    return (bt.isExportDefaultDeclaration(node) ||
        bt.isVariableDeclarator(node) ||
        (bt.isReturnStatement(node) && componentLevel === 1));
}
function isValidObjectProperty(node) {
    return bt.isObjectProperty(node) || bt.isObjectMethod(node);
}
function isVueOption(path$$1, optionsName, componentLevel) {
    if (isValidObjectProperty(path$$1.node) &&
        path$$1.parentPath &&
        path$$1.parentPath.parentPath &&
        isVueComponent(path$$1.parentPath.parentPath, componentLevel)) {
        // General component options
        return path$$1.node.key.name === optionsName;
    }
    else if (isValidObjectProperty(path$$1.node) &&
        path$$1.parentPath &&
        path$$1.parentPath.parentPath &&
        bt.isCallExpression(path$$1.parentPath.parentPath.node) &&
        path$$1.parentPath.parentPath.node.callee.name ===
            'Component' &&
        path$$1.parentPath.parentPath.parentPath &&
        bt.isDecorator(path$$1.parentPath.parentPath.parentPath.node)) {
        // options in ts @Component({...})
        return path$$1.node.key.name === optionsName;
    }
    return false;
}
function runFunction(fnCode) {
    const { code: genCode } = generate(fnCode);
    const code = `return (${genCode})()`;
    try {
        const fn = new Function(code);
        if (typeof fn() === 'object') {
            return JSON.stringify(fn());
        }
        return fn();
    }
    catch (e) {
        return;
    }
}
function getValueFromGenerate(node) {
    let code = 'return';
    const { code: genCode } = generate(node);
    code += genCode;
    const fn = new Function(code);
    try {
        return fn();
    }
    catch (e) {
        console.error(e);
    }
}
function computesFromStore(node) {
    if (node === undefined) {
        return false;
    }
    let fromStore = false;
    if (bt.isObjectMethod(node) || bt.isArrowFunctionExpression(node)) {
        fromStore = computesFromStore(node.body);
    }
    else if (bt.isObjectProperty(node)) {
        fromStore = computesFromStore(node.value);
    }
    else if (bt.isBlockStatement(node)) {
        fromStore = computesFromStore(node.body[node.body.length - 1]);
    }
    else if (bt.isCallExpression(traverse.NodePath)) {
        fromStore = computesFromStore(node.callee);
    }
    else if (bt.isMemberExpression(node)) {
        if (bt.isThisExpression(node.object)) {
            fromStore = node.property.name.toLowerCase().includes('store');
        }
        else {
            fromStore = computesFromStore(node.object);
        }
    }
    else if (bt.isReturnStatement(node) || node.type.includes('Expression')) {
        fromStore = computesFromStore(node.argument);
    }
    return fromStore;
}
function getLiteralValue(node) {
    let data = '';
    if (bt.isStringLiteral(node) ||
        bt.isBooleanLiteral(node) ||
        bt.isNumericLiteral(node)) {
        data = node.value.toString();
    }
    return data;
}

function processPropValue(propValueNode, result, source) {
    if (isAllowPropsType(propValueNode)) {
        result.type = getTypeByTypeNode(propValueNode);
    }
    else if (bt.isObjectExpression(propValueNode)) {
        if (!propValueNode.properties.length)
            return;
        const allPropNodes = propValueNode.properties;
        const typeNode = allPropNodes.filter((node) => {
            if (node.key.name === 'type') {
                return true;
            }
            return false;
        });
        const otherNodes = allPropNodes.filter((node) => {
            if (node.key.name !== 'type') {
                return true;
            }
            return false;
        });
        // Prioritize `type` before processing `default`.
        // Because the difference in `type` will affect the way `default` is handled.
        if (typeNode.length > 0) {
            result.type = getTypeByTypeNode(typeNode[0].value);
            // Get descriptions of the type
            const typeDesc = getComments(typeNode[0]).default;
            if (typeDesc.length > 0) {
                result.typeDesc = typeDesc;
            }
        }
        // Processing props's default value
        otherNodes.forEach(node => {
            if (bt.isSpreadElement(node)) {
                return;
            }
            const n = node.key.name;
            if (n === 'default') {
                if (!hasFunctionTypeDef(result.type)) {
                    if (bt.isObjectMethod(node)) {
                        // Using functionExpression instead of ObjectMethod
                        const params = node.params || [];
                        let body = node.body;
                        if (!bt.isBlockStatement(body)) {
                            body = bt.blockStatement(body);
                        }
                        const r = bt.functionExpression(null, params, body, false, false);
                        result.default = runFunction(r);
                    }
                    else if (bt.isFunction(node.value)) {
                        result.default = runFunction(node.value);
                    }
                    else {
                        let start = node.value.start || 0;
                        let end = node.value.end || 0;
                        // if node.value is stringliteral , e.g: "string literal" need to exclude quote
                        if (bt.isStringLiteral(node.value)) {
                            start++;
                            end--;
                        }
                        // type sucks, fix it use any...
                        result.default = source.slice(start, end) || undefined;
                    }
                }
                else {
                    if (bt.isObjectMethod(node)) {
                        result.default = generate(node).code;
                    }
                    else if (bt.isFunction(node.value)) {
                        result.default = generate(node.value).code;
                    }
                }
                // Get descriptions of the default value
                const defaultDesc = getComments(node).default;
                if (defaultDesc.length > 0) {
                    result.defaultDesc = defaultDesc;
                }
            }
            else if (n === 'required') {
                if (bt.isObjectProperty(node) && bt.isBooleanLiteral(node.value)) {
                    result.required = node.value.value;
                }
            }
            else if (n === 'validator') {
                if (bt.isObjectMethod(node)) {
                    result.validator = generate(node).code;
                }
                else {
                    result.validator = generate(node.value).code;
                }
                // Get descriptions of the validator
                const validatorDesc = getComments(node).default;
                if (validatorDesc.length > 0) {
                    result.validatorDesc = validatorDesc;
                }
            }
        });
    }
}
function normalizeProps(props) {
    return props.map(prop => ({
        type: null,
        name: prop
    }));
}
function getPropDecorator(classPropertyNode) {
    const decorators = classPropertyNode.decorators;
    if (!decorators)
        return;
    return decorators.find(deco => 
    // @Prop()
    (bt.isCallExpression(deco.expression) &&
        bt.isIdentifier(deco.expression.callee) &&
        deco.expression.callee.name === 'Prop') ||
        // @Prop
        (bt.isIdentifier(deco.expression) && deco.expression.name === 'Prop'));
}
function getArgumentFromPropDecorator(deco) {
    return bt.isCallExpression(deco.expression)
        ? deco.expression.arguments[0]
        : null;
}
function getTypeByTypeNode(typeNode) {
    if (bt.isIdentifier(typeNode))
        return typeNode.name;
    if (bt.isArrayExpression(typeNode)) {
        if (!typeNode.elements.length)
            return null;
        return typeNode.elements
            .filter(node => node && bt.isIdentifier(node))
            .map(node => node.name);
    }
    return null;
}
// The `type` of a prop should be an array of constructors or constructors
// eg. String or [String, Number]
function isAllowPropsType(typeNode) {
    return bt.isIdentifier(typeNode) || bt.isArrayExpression(typeNode);
}
function hasFunctionTypeDef(type) {
    if (typeof type === 'string') {
        return type.toLowerCase() === 'function';
    }
    else if (Array.isArray(type)) {
        return type.map(a => a.toLowerCase()).some(b => b === 'function');
    }
    return false;
}

function processDataValue(dataNode, result) {
    result.type = getTypeByDataNode(dataNode);
    result.default = getValueByDataNode(dataNode.value);
}
function getTypeByDataNode(node) {
    if (bt.isObjectMethod(node) || bt.isArrowFunctionExpression(node.value))
        return 'Function';
    const dataNode = node.value;
    if (bt.isIdentifier(dataNode))
        return dataNode.name;
    if (bt.isAssignmentExpression(dataNode) || bt.isAssignmentPattern(dataNode)) {
        if (bt.isIdentifier(dataNode.left)) {
            return dataNode.left.name;
        }
    }
    if (bt.isLiteral(dataNode) ||
        (bt.isExpression(dataNode) && !bt.isBinaryExpression(dataNode))) {
        return literalToType(dataNode.type);
    }
    return '';
}
function getValueByDataNode(dataNode) {
    if (bt.isArrayExpression(dataNode)) {
        if (!dataNode.elements.length)
            return '';
        return ('[' +
            dataNode.elements
                .filter(node => node && bt.isLiteral(node))
                .map(node => getLiteralValue(node))
                .toString() +
            ']');
    }
    if (bt.isLiteral(dataNode)) {
        return getLiteralValue(dataNode);
    }
    if (bt.isAssignmentExpression(dataNode) || bt.isAssignmentPattern(dataNode)) {
        if (bt.isLiteral(dataNode.right)) {
            return getLiteralValue(dataNode.right);
        }
    }
    return '';
}
function literalToType(literal) {
    const type = literal
        .replace('Literal', '')
        .replace('Expression', '')
        .replace('Numeric', 'Number');
    return type;
}

/**
 *
 * @param eventName {string} The event name
 * @param cnode {bt.Node} Node with comments
 * @param result {EventResult}
 */
function processEventName(eventName, cnodePath, result) {
    const cnode = cnodePath.node;
    const syncRE = /^update:(.+)/;
    const eventNameMatchs = eventName.match(syncRE);
    // Mark as .sync
    if (eventNameMatchs) {
        result.isSync = true;
        result.syncProp = eventNameMatchs[1];
    }
    let allComments = getComments(cnode);
    const prevPathKey = Number(cnodePath.key) - 1;
    if (!allComments.default.length && prevPathKey >= 0) {
        // Use the trailing comments of the prev node
        allComments = getComments(cnodePath.getSibling(prevPathKey).node, true);
        result.describe = allComments.default;
        result.argumentsDesc = allComments.arg;
    }
    else {
        result.describe = allComments.default;
        result.argumentsDesc = allComments.arg;
    }
}
function getEmitDecorator(decorators) {
    if (!decorators || !decorators.length)
        return null;
    for (let i = 0; i < decorators.length; i++) {
        const exp = decorators[i].expression;
        if (bt.isCallExpression(exp) &&
            bt.isIdentifier(exp.callee) &&
            exp.callee.name === 'Emit') {
            return decorators[i];
        }
    }
    return null;
}

/**
 * Used to identify ctx.children in the render function and use it as the default slot
 * @param functionPath The node path of the render function
 * @param onSlot
 */
function determineChildren(functionPath, onSlot) {
    if (!bt.isFunction(functionPath.node))
        return;
    // Get the last argument of the render function and use it as the render context
    const lastParamNode = functionPath.node.params[functionPath.node.params.length - 1];
    if (!lastParamNode || !bt.isIdentifier(lastParamNode))
        return;
    // Get the binding of the context within the scope of the render function
    let contextBinding = null;
    const bindingKeys = Object.keys(functionPath.scope.bindings);
    for (let i = 0; i < bindingKeys.length; i++) {
        if (bindingKeys[i] === lastParamNode.name) {
            contextBinding = functionPath.scope.bindings[lastParamNode.name];
        }
    }
    if (!contextBinding)
        return;
    // Determine ctx.childer
    contextBinding.referencePaths.forEach(refPath => {
        if (bt.isIdentifier(refPath.node) &&
            refPath.parentPath &&
            bt.isMemberExpression(refPath.parentPath.node) &&
            bt.isIdentifier(refPath.parentPath.node.property) &&
            refPath.parentPath.node.property.name === 'children') {
            const slotRes = {
                name: 'default',
                describe: '',
                backerDesc: '',
                scoped: false,
                bindings: {},
                target: 'script'
            };
            const commentsRes = bt.isExpressionStatement(refPath.parentPath.parentPath)
                ? getComments(refPath.parentPath.parentPath.node)
                : getComments(refPath.parentPath.node);
            slotRes.describe = commentsRes.default.join('');
            slotRes.backerDesc = commentsRes.content
                ? commentsRes.content.join('')
                : '';
            if (onSlot)
                onSlot(slotRes);
        }
    });
}

class Seen {
    constructor() {
        this.seenSet = new Set();
    }
    seen(label) {
        const yes = this.seenSet.has(label);
        if (!yes)
            this.seenSet.add(label);
        return yes;
    }
}

// const vueComponentVisitor =
function parseJavascript(ast, seenEvent, options, source = '') {
    // backward compatibility
    const seenSlot = new Seen();
    let exportDefaultReferencePath = null;
    let componentLevel = 0;
    const vueComponentVisitor = {
        Decorator(path$$1) {
            if (componentLevel === 0 &&
                bt.isCallExpression(path$$1.node.expression) &&
                bt.isIdentifier(path$$1.node.expression.callee, { name: 'Component' }) &&
                path$$1.node.expression.arguments.length &&
                bt.isObjectExpression(path$$1.node.expression.arguments[0])) {
                path$$1.traverse(vueComponentVisitor);
            }
        },
        ObjectProperty(path$$1) {
            const { onProp, onMethod, onComputed, onName, onSlot, onMixIn, onData, onWatch } = options;
            // Processing name
            if (isVueOption(path$$1, 'name', componentLevel)) {
                const componentName = path$$1.node.value.value;
                if (onName)
                    onName(componentName);
            }
            // Processing props
            if (onProp && isVueOption(path$$1, 'props', componentLevel)) {
                const valuePath = path$$1.get('value');
                if (bt.isArrayExpression(valuePath.node)) {
                    // An array of strings
                    const propsValue = getValueFromGenerate(valuePath.node);
                    const propsRes = normalizeProps(propsValue);
                    propsRes.forEach(prop => {
                        if (onProp)
                            onProp(prop);
                    });
                }
                else if (bt.isObjectExpression(valuePath.node)) {
                    // An object
                    valuePath.traverse({
                        ObjectProperty(propPath) {
                            // Guarantee that this is the prop definition
                            if (propPath.parentPath === valuePath) {
                                const name = bt.isIdentifier(propPath.node.key)
                                    ? propPath.node.key.name
                                    : propPath.node.key.value;
                                const propValueNode = propPath.node.value;
                                const result = {
                                    name,
                                    type: null,
                                    describe: getComments(propPath.node).default
                                };
                                processPropValue(propValueNode, result, source);
                                onProp(result);
                            }
                        }
                    });
                }
            }
            // Processing mixins
            if (onMixIn && isVueOption(path$$1, 'mixins', componentLevel)) {
                const properties = path$$1.node.value.elements;
                properties.forEach(mixIn => {
                    const result = {
                        mixIn: mixIn.name
                    };
                    onMixIn(result);
                });
            }
            // Processing computed
            if (onComputed &&
                isVueOption(path$$1, 'computed', componentLevel) &&
                bt.isObjectExpression(path$$1.node.value)) {
                const properties = path$$1.node
                    .value.properties.filter(n => bt.isObjectMethod(n) || bt.isObjectProperty(n));
                properties.forEach(node => {
                    const commentsRes = getComments(node);
                    const isFromStore = computesFromStore(node);
                    // Collect only computed that have @vuese annotations
                    if (commentsRes.vuese) {
                        const result = {
                            name: node.key.name,
                            type: commentsRes.type,
                            describe: commentsRes.default,
                            isFromStore: isFromStore
                        };
                        onComputed(result);
                    }
                });
            }
            if (onData &&
                isVueOption(path$$1, 'data', componentLevel) &&
                (bt.isObjectExpression(path$$1.node.value) ||
                    bt.isArrowFunctionExpression(path$$1.node.value))) {
                let value = bt.isArrowFunctionExpression(path$$1.node.value)
                    ? path$$1.node.value.body
                    : path$$1.node.value;
                /**
                 * data: () => {
                 *  return {}
                 * }
                 * if data property is something like above, should process its return statement
                 * argument
                 */
                if (bt.isBlockStatement(value)) {
                    const returnStatement = value.body.filter(n => bt.isReturnStatement(n))[0];
                    if (returnStatement &&
                        returnStatement.argument &&
                        bt.isObjectExpression(returnStatement.argument)) {
                        value = returnStatement.argument;
                    }
                }
                if (bt.isObjectExpression(value)) {
                    const properties = value.properties.filter(n => bt.isObjectProperty(n));
                    properties.forEach(node => {
                        if (bt.isSpreadElement(node)) {
                            return;
                        }
                        const commentsRes = getComments(node);
                        // Collect only data that have @vuese annotations
                        if (commentsRes.vuese && bt.isObjectProperty(node)) {
                            const result = {
                                name: node.key.name,
                                type: '',
                                describe: commentsRes.default,
                                default: ''
                            };
                            processDataValue(node, result);
                            onData(result);
                        }
                    });
                }
            }
            // Processing methods
            if (onMethod && isVueOption(path$$1, 'methods', componentLevel)) {
                const properties = path$$1.node
                    .value.properties.filter(n => bt.isObjectMethod(n) || bt.isObjectProperty(n));
                properties.forEach(node => {
                    const commentsRes = getComments(node);
                    // Collect only methods that have @vuese annotations
                    if (commentsRes.vuese) {
                        const result = {
                            name: node.key.name,
                            describe: commentsRes.default,
                            argumentsDesc: commentsRes.arg
                        };
                        onMethod(result);
                    }
                });
            }
            // Processing watch
            if (onWatch &&
                isVueOption(path$$1, 'watch', componentLevel) &&
                bt.isObjectExpression(path$$1.node.value)) {
                const properties = path$$1.node
                    .value.properties.filter(n => bt.isObjectMethod(n) || bt.isObjectProperty(n));
                properties.forEach(node => {
                    const commentsRes = getComments(node);
                    // Collect only data that have @vuese annotations
                    if (commentsRes.vuese) {
                        const result = {
                            name: node.key.name,
                            describe: commentsRes.default,
                            argumentsDesc: commentsRes.arg
                        };
                        onWatch(result);
                    }
                });
            }
            // functional component - `ctx.children` in the render function
            if (onSlot &&
                isVueOption(path$$1, 'render', componentLevel) &&
                !seenSlot.seen('default')) {
                const functionPath = path$$1.get('value');
                determineChildren(functionPath, onSlot);
            }
        },
        ObjectMethod(path$$1) {
            const { onData } = options;
            // @Component: functional component - `ctx.children` in the render function
            if (options.onSlot &&
                isVueOption(path$$1, 'render', componentLevel) &&
                !seenSlot.seen('default')) {
                determineChildren(path$$1, options.onSlot);
            }
            // Data can be represented as a component or a method
            if (onData && isVueOption(path$$1, 'data', componentLevel)) {
                path$$1.node.body.body.forEach(body => {
                    if (bt.isReturnStatement(body)) {
                        const properties = body.argument.properties.filter(n => bt.isObjectMethod(n) || bt.isObjectProperty(n));
                        properties.forEach(node => {
                            const commentsRes = getComments(node);
                            // Collect only data that have @vuese annotations for backward compability
                            if (commentsRes.vuese) {
                                const result = {
                                    name: node.key.name,
                                    type: '',
                                    describe: commentsRes.default,
                                    default: ''
                                };
                                processDataValue(node, result);
                                onData(result);
                            }
                        });
                    }
                });
            }
        },
        CallExpression(path$$1) {
            const node = path$$1.node;
            // $emit()
            if (bt.isMemberExpression(node.callee) &&
                bt.isIdentifier(node.callee.property) &&
                node.callee.property.name === '$emit') {
                // for performance issue only check when it is like a `$emit` CallExpression
                const parentExpressionStatementNode = path$$1.findParent(path$$1 => bt.isExpressionStatement(path$$1));
                if (bt.isExpressionStatement(parentExpressionStatementNode)) {
                    processEmitCallExpression(path$$1, seenEvent, options, parentExpressionStatementNode);
                }
            }
            else if (options.onSlot &&
                bt.isMemberExpression(node.callee) &&
                bt.isMemberExpression(node.callee.object) &&
                bt.isIdentifier(node.callee.object.property) &&
                node.callee.object.property.name === '$scopedSlots') {
                // scopedSlots
                let slotsComments;
                if (bt.isExpressionStatement(path$$1.parentPath)) {
                    slotsComments = getComments(path$$1.parentPath.node);
                }
                else {
                    slotsComments = getComments(node);
                }
                const scopedSlots = {
                    name: node.callee.property.name,
                    describe: slotsComments.default.join(''),
                    backerDesc: slotsComments.content
                        ? slotsComments.content.join('')
                        : '',
                    bindings: {},
                    scoped: true,
                    target: 'script'
                };
                options.onSlot(scopedSlots);
            }
        },
        // Class style component
        ClassProperty(path$$1) {
            const propDeco = getPropDecorator(path$$1.node);
            if (propDeco) {
                let typeAnnotationStart = 0;
                let typeAnnotationEnd = 0;
                /**
                 * if ClassProperty like this
                 *` b: number | string`
                 *  if classProperty has typeAnnotation just use it as its type, unless it has decorator
                 */
                if (path$$1.node.typeAnnotation &&
                    bt.isTSTypeAnnotation(path$$1.node.typeAnnotation)) {
                    const { start, end } = path$$1.node.typeAnnotation.typeAnnotation;
                    typeAnnotationStart = start || 0;
                    typeAnnotationEnd = end || 0;
                }
                const result = {
                    name: path$$1.node.key.name,
                    //null for backward compatibility,
                    type: source.slice(typeAnnotationStart, typeAnnotationEnd) || null,
                    describe: getComments(path$$1.node).default
                };
                const propDecoratorArg = getArgumentFromPropDecorator(propDeco);
                if (propDecoratorArg) {
                    processPropValue(propDecoratorArg, result, source);
                }
                if (options.onProp)
                    options.onProp(result);
            }
        },
        ClassMethod(path$$1) {
            const node = path$$1.node;
            const commentsRes = getComments(node);
            // Collect only methods that have @vuese annotations
            if (commentsRes.vuese) {
                const result = {
                    name: node.key.name,
                    describe: commentsRes.default,
                    argumentsDesc: commentsRes.arg
                };
                if (options.onMethod)
                    options.onMethod(result);
            }
            // Ctx.children in the render function of the Class style component
            if (options.onSlot &&
                bt.isIdentifier(node.key) &&
                node.key.name === 'render' &&
                !seenSlot.seen('default')) {
                determineChildren(path$$1, options.onSlot);
            }
            // @Emit
            const emitDecorator = getEmitDecorator(node.decorators);
            if (emitDecorator) {
                const result = {
                    name: '',
                    isSync: false,
                    syncProp: ''
                };
                const args = emitDecorator.expression.arguments;
                if (args && args.length && bt.isStringLiteral(args[0])) {
                    result.name = args[0].value;
                }
                else {
                    if (bt.isIdentifier(node.key)) {
                        result.name = node.key.name.replace(/([A-Z])/g, '-$1').toLowerCase();
                    }
                }
                if (!result.name || seenEvent.seen(result.name))
                    return;
                processEventName(result.name, path$$1, result);
                // trigger onEvent if options has an onEvent callback function and
                // if excludeSyncEvent, should `result.isSync` be true, otherwise just call the callback
                if (options.onEvent && (!!options.includeSyncEvent || !result.isSync)) {
                    options.onEvent(result);
                }
            }
        },
        MemberExpression(path$$1) {
            const node = path$$1.node;
            const parentNode = path$$1.parentPath.node;
            const grandPath = path$$1.parentPath.parentPath;
            if (options.onSlot &&
                bt.isIdentifier(node.property) &&
                node.property.name === '$slots' &&
                grandPath) {
                let slotName = '';
                let slotsComments = {
                    default: []
                };
                if (bt.isMemberExpression(parentNode) &&
                    bt.isIdentifier(parentNode.property)) {
                    // (this || vm).$slots.xxx
                    slotName = parentNode.property.name;
                    slotsComments = bt.isExpressionStatement(grandPath.node)
                        ? getComments(grandPath.node)
                        : getComments(parentNode);
                }
                else if (bt.isCallExpression(parentNode) &&
                    bt.isMemberExpression(grandPath.node) &&
                    bt.isIdentifier(grandPath.node.property)) {
                    // ctx.$slots().xxx
                    slotName = grandPath.node.property.name;
                    const superNode = grandPath.parentPath.node;
                    slotsComments = bt.isExpressionStatement(superNode)
                        ? getComments(superNode)
                        : getComments(grandPath.node);
                }
                // Avoid collecting the same slot multiple times
                if (!slotName || seenSlot.seen(slotName))
                    return;
                const slotRes = {
                    name: slotName,
                    describe: slotsComments.default.join(''),
                    backerDesc: slotsComments.content
                        ? slotsComments.content.join('')
                        : '',
                    bindings: {},
                    scoped: false,
                    target: 'script'
                };
                options.onSlot(slotRes);
            }
        }
    };
    traverse__default(ast, {
        Program(path$$1) {
            exportDefaultReferencePath = getExportDefaultReferencePath(path$$1);
        },
        ExportDefaultDeclaration(rootPath) {
            // Get a description of the component
            // if it is
            let traversePath = rootPath;
            if (isObject(exportDefaultReferencePath) &&
                (bt.isVariableDeclarator(exportDefaultReferencePath) ||
                    bt.isReturnStatement(exportDefaultReferencePath))) {
                traversePath = exportDefaultReferencePath;
            }
            if (bt.isExportDefaultDeclaration(traversePath) && options.onDesc)
                options.onDesc(getComponentDescribe(rootPath.node));
            traversePath.traverse({
                ObjectExpression: {
                    enter(path$$1) {
                        componentLevel++;
                        if (componentLevel === 1) {
                            if (bt.isVariableDeclarator(traversePath) && options.onDesc) {
                                const comments = getComments(traversePath.parentPath.node);
                                options.onDesc(comments);
                            }
                            else if (bt.isReturnStatement(traversePath) && options.onDesc) {
                                const comments = getComments(traversePath.node);
                                options.onDesc(comments);
                            }
                            path$$1.traverse(vueComponentVisitor);
                        }
                    },
                    exit() {
                        componentLevel--;
                    }
                },
                ClassBody: {
                    enter(path$$1) {
                        componentLevel++;
                        if (componentLevel === 1) {
                            path$$1.traverse(vueComponentVisitor);
                        }
                    },
                    exit() {
                        componentLevel--;
                    }
                }
            });
        }
    });
}
function processEmitCallExpression(path$$1, seenEvent, options, parentExpressionStatementNodePath) {
    const node = path$$1.node;
    const { onEvent, includeSyncEvent } = options;
    const args = node.arguments;
    const result = {
        name: '',
        isSync: false,
        syncProp: ''
    };
    const firstArg = args[0];
    if (firstArg) {
        if (bt.isStringLiteral(firstArg)) {
            result.name = firstArg.value;
        }
        else {
            if (bt.isIdentifier(firstArg)) {
                result.name = '`' + firstArg.name + '`';
            }
        }
    }
    if (!result.name || seenEvent.seen(result.name))
        return;
    processEventName(result.name, parentExpressionStatementNodePath, result);
    if (onEvent && (!!includeSyncEvent || !result.isSync)) {
        onEvent(result);
    }
}
/**
 * return export default referencePath for uncommon component export
 *
 * @param {NodePath<bt.Program>} programPath
 * @returns {(NodePath<bt.Node> | null)}
 */
function getExportDefaultReferencePath(programPath) {
    const bindings = programPath.scope.bindings;
    let exportDefaultReferencePath = null;
    Object.keys(bindings).forEach(key => {
        bindings[key].referencePaths.forEach(path$$1 => {
            if (bt.isExportDefaultDeclaration(path$$1.parent) ||
                (bt.isCallExpression(path$$1.parentPath) &&
                    bt.isExportDefaultDeclaration(path$$1.parentPath.parentPath))) {
                exportDefaultReferencePath = bindings[key].path;
                // return ReturnStatement instead of FunctionDeclaration just keep consistency for a component, especially when extract
                // its comments
                if (bt.isFunctionDeclaration(exportDefaultReferencePath)) {
                    exportDefaultReferencePath.traverse({
                        ReturnStatement(path$$1) {
                            exportDefaultReferencePath = path$$1;
                            path$$1.skip();
                        }
                    });
                }
            }
        });
    });
    return exportDefaultReferencePath;
}
function isObject(obj) {
    return obj !== null && typeof obj === 'object';
}

function parseTemplate$$1(templateAst, seenEvent, options) {
    const parent = templateAst.parent;
    // parse event in template
    if (templateAst.attrsMap) {
        for (const [attr, value] of Object.entries(templateAst.attrsMap)) {
            if ((attr.startsWith('v-on:') || attr.startsWith('@')) &&
                /\$emit\(.*?\)/.test(value)) {
                try {
                    const astFile = parser.parse(value);
                    if (astFile && astFile.type === 'File') {
                        parseExpression(astFile, seenEvent, options);
                    }
                }
                catch (err) {
                    console.error(err);
                }
            }
        }
    }
    if (templateAst.type === 1) {
        if (templateAst.tag === 'slot') {
            const slot = {
                name: 'default',
                describe: '',
                backerDesc: '',
                bindings: {},
                scoped: false,
                target: 'template'
            };
            slot.bindings = extractAndFilterAttr(templateAst.attrsMap);
            if (slot.bindings.name) {
                slot.name = slot.bindings.name;
                delete slot.bindings.name;
            }
            // scoped slot
            if (Object.keys(slot.bindings).length)
                slot.scoped = true;
            if (parent) {
                const list = parent.children;
                let currentSlotIndex = 0;
                for (let i = 0; i < list.length; i++) {
                    const el = list[i];
                    if (el === templateAst) {
                        currentSlotIndex = i;
                        break;
                    }
                }
                // Find the first leading comment node as a description of the slot
                const copies = list.slice(0, currentSlotIndex).reverse();
                for (let i = 0; i < copies.length; i++) {
                    const el = copies[i];
                    if (el.type !== 3 || (!el.isComment && el.text.trim()))
                        break;
                    if (el.isComment &&
                        !(parent.tag === 'slot' && parent.children[0] === el)) {
                        slot.describe = el.text.trim();
                        break;
                    }
                }
                // Find the first child comment node as a description of the default slot content
                if (templateAst.children.length) {
                    for (let i = 0; i < templateAst.children.length; i++) {
                        const el = templateAst.children[i];
                        if (el.type !== 3 || (!el.isComment && el.text.trim()))
                            break;
                        if (el.isComment) {
                            slot.backerDesc = el.text.trim();
                            break;
                        }
                    }
                }
            }
            if (options.onSlot)
                options.onSlot(slot);
        }
        if (templateAst.scopedSlots) {
            Object.values(templateAst.scopedSlots).forEach(scopedSlot => {
                parseTemplate$$1(scopedSlot, seenEvent, options);
            });
        }
        const parseChildren = (templateAst) => {
            for (let i = 0; i < templateAst.children.length; i++) {
                parseTemplate$$1(templateAst.children[i], seenEvent, options);
            }
        };
        if (templateAst.if && templateAst.ifConditions) {
            // for if statement iterate through the branches
            templateAst.ifConditions.forEach((c) => {
                parseChildren(c.block);
            });
        }
        else {
            parseChildren(templateAst);
        }
    }
}
const dirRE = /^(v-|:|@)/;
const allowRE = /^(v-bind|:)/;
function extractAndFilterAttr(attrsMap) {
    const res = {};
    const keys = Object.keys(attrsMap);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!dirRE.test(key) || allowRE.test(key)) {
            res[key.replace(allowRE, '')] = attrsMap[key];
        }
    }
    return res;
}
function parseExpression(astFile, seenEvent, options) {
    traverse__default(astFile, {
        CallExpression(path$$1) {
            const node = path$$1.node;
            // $emit()
            if (bt.isIdentifier(node.callee) && node.callee.name === '$emit') {
                const parentExpressionStatementNodePath = path$$1.findParent(path$$1 => bt.isExpressionStatement(path$$1));
                if (bt.isExpressionStatement(parentExpressionStatementNodePath)) {
                    processEmitCallExpression(path$$1, seenEvent, options, parentExpressionStatementNodePath);
                }
            }
        }
    });
}

function parser$1(source, options = {}) {
    const astRes = sfcToAST(source, options.babelParserPlugins, options.basedir, options.jsFile);
    const res = {};
    const defaultOptions = {
        onName(name) {
            res.name = name;
        },
        onDesc(desc) {
            res.componentDesc = desc;
        },
        onProp(propsRes) {
            (res.props || (res.props = [])).push(propsRes);
        },
        onEvent(eventsRes) {
            (res.events || (res.events = [])).push(eventsRes);
        },
        onSlot(slotRes) {
            (res.slots || (res.slots = [])).push(slotRes);
        },
        onMixIn(mixInRes) {
            (res.mixIns || (res.mixIns = [])).push(mixInRes);
        },
        onMethod(methodRes) {
            (res.methods || (res.methods = [])).push(methodRes);
        },
        onComputed(computedRes) {
            (res.computed || (res.computed = [])).push(computedRes);
        },
        onData(dataRes) {
            (res.data || (res.data = [])).push(dataRes);
        },
        onWatch(watchRes) {
            (res.watch || (res.watch = [])).push(watchRes);
        }
    };
    const finallyOptions = { ...defaultOptions, ...options };
    const seenEvent = new Seen();
    if (astRes.jsAst) {
        parseJavascript(astRes.jsAst, seenEvent, finallyOptions, astRes.jsSource);
    }
    if (astRes.templateAst) {
        parseTemplate$$1(astRes.templateAst, seenEvent, finallyOptions);
    }
    res.extraDocs = astRes.docSource;
    return res;
}

exports.parser = parser$1;
exports.sfcToAST = sfcToAST;
exports.parseJavascript = parseJavascript;
exports.processEmitCallExpression = processEmitCallExpression;
exports.parseTemplate = parseTemplate$$1;
exports.isVueComponent = isVueComponent;
exports.isVueOption = isVueOption;
exports.runFunction = runFunction;
exports.getValueFromGenerate = getValueFromGenerate;
exports.computesFromStore = computesFromStore;
exports.getLiteralValue = getLiteralValue;
exports.getComments = getComments;
exports.getComponentDescribe = getComponentDescribe;
exports.isCommentLine = isCommentLine;
exports.isCommentBlock = isCommentBlock;
exports.isCodeBlockDeclaration = isCodeBlockDeclaration;
exports.filterBlockComments = filterBlockComments;
