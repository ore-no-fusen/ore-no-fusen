use std::collections::BTreeMap;
use std::future::Future;

// Only independent reads run in parallel. Validation and writes stay with the caller.
pub(crate) async fn read_all<T, R, F, Fut>(items: Vec<T>, fetch: F) -> Result<Vec<R>, String>
where
    R: Send + 'static,
    F: Fn(T) -> Fut,
    Fut: Future<Output = Result<R, String>> + Send + 'static,
{
    read_all_with_progress(items, fetch, |_, _| {}).await
}

pub(crate) async fn read_all_with_progress<T, R, F, Fut, P>(
    items: Vec<T>,
    fetch: F,
    progress: P,
) -> Result<Vec<R>, String>
where
    R: Send + 'static,
    F: Fn(T) -> Fut,
    Fut: Future<Output = Result<R, String>> + Send + 'static,
    P: Fn(usize, usize) + Send + Sync,
{
    let total = items.len();
    progress(0, total);
    let mut pending = items.into_iter().enumerate();
    let mut tasks = tokio::task::JoinSet::new();
    let mut results = BTreeMap::new();
    loop {
        while tasks.len() < 6 {
            let Some((index, item)) = pending.next() else {
                break;
            };
            let request = fetch(item);
            tasks.spawn(async move { (index, request.await) });
        }
        match tasks.join_next().await {
            None => break,
            Some(Ok((index, Ok(value)))) => {
                results.insert(index, value);
                progress(results.len(), total);
            }
            Some(Ok((_, Err(error)))) => {
                tasks.abort_all();
                return Err(error);
            }
            Some(Err(_)) => {
                tasks.abort_all();
                return Err("共有記録の取得処理が中断されました".into());
            }
        }
    }
    Ok(results.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    #[test]
    fn reports_completed_counts_and_empty_batch() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let events = std::sync::Mutex::new(Vec::new());
                read_all_with_progress(
                    vec![1, 2, 3],
                    |n| async move { Ok(n) },
                    |done, total| events.lock().unwrap().push((done, total)),
                )
                .await
                .unwrap();
                assert_eq!(
                    *events.lock().unwrap(),
                    vec![(0, 3), (1, 3), (2, 3), (3, 3)]
                );
                let events = std::sync::Mutex::new(Vec::new());
                read_all_with_progress(
                    Vec::<u8>::new(),
                    |n| async move { Ok(n) },
                    |done, total| events.lock().unwrap().push((done, total)),
                )
                .await
                .unwrap();
                assert_eq!(*events.lock().unwrap(), vec![(0, 0)]);
            });
    }
    #[test]
    fn reads_concurrently_with_a_bound_and_preserves_order() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let active = Arc::new(AtomicUsize::new(0));
                let peak = Arc::new(AtomicUsize::new(0));
                let result = read_all((0..19).collect(), |n| {
                    let active = active.clone();
                    let peak = peak.clone();
                    async move {
                        let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                        peak.fetch_max(current, Ordering::SeqCst);
                        tokio::time::sleep(std::time::Duration::from_millis((20 - n) as u64)).await;
                        active.fetch_sub(1, Ordering::SeqCst);
                        Ok(n)
                    }
                })
                .await
                .unwrap();
                assert_eq!(result, (0..19).collect::<Vec<_>>());
                assert_eq!(peak.load(Ordering::SeqCst), 6);
                assert_eq!(active.load(Ordering::SeqCst), 0);
            });
    }

    #[test]
    fn any_failed_read_rejects_the_entire_batch_and_empty_is_valid() {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let result = read_all(vec![1, 2, 3], |n| async move {
                    if n == 2 {
                        Err("read failed".into())
                    } else {
                        Ok(n)
                    }
                })
                .await;
                assert_eq!(result, Err("read failed".into()));
                assert_eq!(
                    read_all(Vec::<u8>::new(), |n| async move { Ok(n) })
                        .await
                        .unwrap(),
                    Vec::<u8>::new()
                );
            });
    }
}
