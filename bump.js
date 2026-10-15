// الاستعمال: node bump.js  — يرفع رقم الإصدار في sw.js وapp.js معًا
const fs = require('fs');
let sw = fs.readFileSync('sw.js', 'utf8');
const v = +sw.match(/var VERSION = (\d+)/)[1] + 1;
sw = sw.replace(/var VERSION = \d+/, 'var VERSION = ' + v);
fs.writeFileSync('sw.js', sw);
let app = fs.readFileSync('app.js', 'utf8');
app = app.replace(/var APP_VERSION = \d+/, 'var APP_VERSION = ' + v);
fs.writeFileSync('app.js', app);
let ex = fs.readFileSync('exam/sw.js', 'utf8');
ex = ex.replace(/var VERSION = (\d+)/, (m, n) => 'var VERSION = ' + (+n + 1));
fs.writeFileSync('exam/sw.js', ex);
console.log('الإصدار الآن', v, '(وصفحة الطالب', ex.match(/var VERSION = (\d+)/)[1] + ')');
