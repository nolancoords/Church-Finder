import fs from 'fs';
const key = fs.readFileSync('./serviceAccountKey.json', 'utf8');
const oneline = JSON.stringify(JSON.parse(key));
const existing = fs.readFileSync('./.env', 'utf8');
const lines = existing.split('\n').filter(l => !l.startsWith('FIRE')).join('\n').trim();
fs.writeFileSync('./.env', lines + '\nFIREBASE_SERVICE_ACCOUNT=' + oneline + '\n');
console.log('Done!');