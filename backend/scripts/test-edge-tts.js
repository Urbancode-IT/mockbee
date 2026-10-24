const fs = require('fs')
const path = require('path')
const { Communicate } = require('edge-tts-universal')

async function main() {
  const outLog = path.join(__dirname, '..', '.tmp_tts_out.txt')
  const outMp3 = path.join(__dirname, '..', '.tmp_tts_test2.mp3')
  const log = (s) => {
    fs.appendFileSync(outLog, `${s}\n`)
    process.stdout.write(`${s}\n`)
  }
  fs.writeFileSync(outLog, '')
  log('start')
  const communicate = new Communicate('Hello, this is your MockBee interviewer voice check.', {
    voice: 'en-US-AriaNeural',
    rate: '-8%',
  })
  const chunks = []
  for await (const chunk of communicate.stream()) {
    if (chunk.type === 'audio' && chunk.data) chunks.push(Buffer.from(chunk.data))
  }
  const buf = Buffer.concat(chunks)
  log(`bytes=${buf.length}`)
  if (!buf.length) throw new Error('empty audio')
  fs.writeFileSync(outMp3, buf)
  log(`wrote ${outMp3}`)
}

main().catch((e) => {
  fs.appendFileSync(path.join(__dirname, '..', '.tmp_tts_out.txt'), `ERR ${e.stack}\n`)
  console.error(e)
  process.exit(1)
})
