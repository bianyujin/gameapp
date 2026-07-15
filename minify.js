// 简单的JS压缩脚本：从 app.js 生成 app.min.js
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf-8');

let minified = src
    // 移除单行注释（不影响URL中的//）
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // 移除多行注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 移除console.log调试输出
    .replace(/console\.log\([^)]*\);?/g, '')
    // 移除多余空格
    .replace(/\s+/g, ' ')
    // 移除运算符周围的空格
    .replace(/\s*([=+\-*/%<>!&|?:;,{}()\[\]])\s*/g, '$1')
    // 移除行首行尾空格
    .trim();

fs.writeFileSync(path.join(__dirname, 'js/app.min.js'), minified, 'utf-8');
console.log('压缩完成: ' + minified.length + ' 字符 (原: ' + src.length + ' 字符, 压缩率: ' + Math.round((1 - minified.length/src.length)*100) + '%)');
