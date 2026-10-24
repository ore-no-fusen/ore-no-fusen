//! Bounded process-only cache. Drive listing version is required for every hit.
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Mutex, OnceLock},
};
const MAX_BYTES: usize = 4 * 1024 * 1024;
const MAX_RECORDS: usize = 256;
#[derive(Default)]
struct Cache {
    scope: Option<(String, String)>,
    entries: BTreeMap<String, (String, Value, String, usize)>,
    bytes: usize,
}
impl Cache {
    fn select(&mut self, account: &str, folder: &str) {
        let scope = (account.to_owned(), folder.to_owned());
        if self.scope.as_ref() != Some(&scope) {
            self.entries.clear();
            self.bytes = 0;
            self.scope = Some(scope);
        }
    }
    fn remove(&mut self, id: &str) {
        if let Some((_, _, _, size)) = self.entries.remove(id) {
            self.bytes -= size;
        }
    }
    fn get(
        &mut self,
        account: &str,
        folder: &str,
        id: &str,
        version: Option<&str>,
    ) -> Option<(Value, String)> {
        self.select(account, folder);
        let version = version.filter(|v| !v.is_empty())?;
        let entry = self.entries.get(id)?;
        if entry.0 != version {
            return None;
        }
        Some((entry.1.clone(), entry.2.clone()))
    }
    fn put(
        &mut self,
        account: &str,
        folder: &str,
        id: &str,
        version: &str,
        value: &Value,
        etag: &str,
    ) {
        self.select(account, folder);
        self.remove(id);
        let size = serde_json::to_vec(value)
            .map(|v| v.len())
            .unwrap_or(MAX_BYTES + 1)
            + version.len()
            + etag.len()
            + id.len();
        if version.is_empty() || etag.is_empty() || size > MAX_BYTES {
            return;
        }
        while self.bytes + size > MAX_BYTES || self.entries.len() >= MAX_RECORDS {
            let Some(old) = self.entries.keys().next().cloned() else {
                break;
            };
            self.remove(&old);
        }
        self.entries.insert(
            id.into(),
            (version.into(), value.clone(), etag.into(), size),
        );
        self.bytes += size;
    }
}
fn cache() -> &'static Mutex<Cache> {
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(Cache::default()))
}
pub fn retain(account: &str, folder: &str, ids: &HashSet<String>) {
    let mut c = cache().lock().unwrap_or_else(|p| p.into_inner());
    c.select(account, folder);
    let removed = c
        .entries
        .keys()
        .filter(|id| !ids.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    for id in removed {
        c.remove(&id);
    }
}
pub fn get(
    account: &str,
    folder: &str,
    id: &str,
    version: Option<&str>,
) -> Option<(Value, String)> {
    cache()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .get(account, folder, id, version)
}
pub fn put(account: &str, folder: &str, id: &str, version: &str, value: &Value, etag: &str) {
    cache()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .put(account, folder, id, version, value, etag);
}
pub fn invalidate(id: &str) {
    cache().lock().unwrap_or_else(|p| p.into_inner()).remove(id);
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requires_scope_and_version_and_returns_independent_copies() {
        let mut c = Cache::default();
        let v = serde_json::json!({"a":1});
        c.put("a", "f", "id", "1", &v, "etag");
        assert!(c.get("a", "f", "id", None).is_none());
        assert!(c.get("a", "f", "id", Some("2")).is_none());
        let (mut copy, _) = c.get("a", "f", "id", Some("1")).unwrap();
        copy["a"] = 2.into();
        assert_eq!(c.get("a", "f", "id", Some("1")).unwrap().0, v);
        assert!(c.get("b", "f", "id", Some("1")).is_none());
        assert!(c.get("a", "other", "id", Some("1")).is_none());
    }
    #[test]
    fn bounded_and_invalidated() {
        let mut c = Cache::default();
        for i in 0..300 {
            c.put(
                "a",
                "f",
                &i.to_string(),
                "1",
                &serde_json::json!({"x":"y"}),
                "e",
            );
        }
        assert!(c.entries.len() <= MAX_RECORDS && c.bytes <= MAX_BYTES);
        c.remove("299");
        assert!(c.get("a", "f", "299", Some("1")).is_none());
        c.put(
            "a",
            "f",
            "huge",
            "1",
            &Value::String("x".repeat(MAX_BYTES)),
            "e",
        );
        assert!(c.get("a", "f", "huge", Some("1")).is_none());
    }
}
