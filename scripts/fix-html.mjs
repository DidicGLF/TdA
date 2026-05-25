import { readFileSync, writeFileSync } from 'fs'

const html = readFileSync('dist/index.html', 'utf-8')
const fixed = html
  .replace(/ type="module"/g, '')
  .replace(/ crossorigin/g, '')
  .replace(/<script /g, '<script defer ')
writeFileSync('dist/index.html', fixed)
console.log('index.html patched for file:// compatibility')
