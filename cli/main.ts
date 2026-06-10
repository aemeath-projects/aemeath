import { buildProgram } from './commands.js'
import { runMenu } from './menu.js'

const isInteractive = process.argv.length <= 2

if (isInteractive) {
  await runMenu()
} else {
  const program = buildProgram()
  await program.parseAsync(process.argv)
}
