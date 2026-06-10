import cliProgress from 'cli-progress'
import ora from 'ora'

/** 带进度条执行异步任务，task 通过 tick() 回调推进进度 */
export async function withProgress(
  label: string,
  total: number,
  task: (tick: () => void) => Promise<void>,
): Promise<void> {
  const bar = new cliProgress.SingleBar(
    { format: `${label} [{bar}] {percentage}% | {value}/{total}` },
    cliProgress.Presets.shades_classic,
  )
  bar.start(total, 0)
  await task(() => {
    bar.increment()
  })
  bar.stop()
}

/** 带 spinner 执行异步任务，返回 task 的执行结果 */
export async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  const spinner = ora(label).start()
  try {
    const result = await task()
    spinner.succeed()
    return result
  } catch (err) {
    spinner.fail()
    throw err
  }
}
