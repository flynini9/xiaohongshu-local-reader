export async function retrySnapshotEvaluate(read, wait = () => new Promise((resolve) => setTimeout(resolve, 250))) {
  try {
    return await read();
  } catch (error) {
    if (error?.message !== "Browser CDP timed out: Runtime.evaluate") throw error;
    await wait();
    return read(); // One retry of the read only; never repeat Page.navigate or input events.
  }
}
