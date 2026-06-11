/*
 * クラッシュガード（Windows 専用）
 *
 * 責務:
 * - プロセスに注入された第三者 DLL 由来の例外（特に不正命令 0xC000001D）を
 *   ベクター例外ハンドラ(VEH)で捕捉し、どのアドレスで落ちたかを crash.log に記録する。
 *
 * 背景:
 * - Microsoft Store 認定環境で、注入された ASProxy64.dll 内で
 *   STATUS_ILLEGAL_INSTRUCTION (0xC000001D) が発生しプロセスが落ちた。
 * - 当アプリのコードは無関係だが、巻き込まれて落ちる。
 *   本ガードは例外発生箇所を自前ログに残し、原因の切り分けを可能にする。
 *
 * 設計上の注意:
 * - ハンドラはメモリ破損の可能性がある危険な文脈で動く。内部処理は最小限に保つ。
 *   既存 logger（ロック取得あり）は呼ばず、独立した crash.log へ低レベル追記のみ行う。
 * - 不正命令例外で実行を強引に継続するのは未定義動作になり危険なため、
 *   記録後は EXCEPTION_CONTINUE_SEARCH を返し、通常の例外処理に委ねる。
 */

#[cfg(windows)]
pub fn install() {
    use windows::Win32::System::Diagnostics::Debug::AddVectoredExceptionHandler;

    // 例外が「最初に」ハンドラへ届くよう first=1 で登録する。
    // 戻り値ハンドルは破棄するが、ハンドラはプロセス終了まで有効。
    unsafe {
        AddVectoredExceptionHandler(1, Some(veh_handler));
    }
}

#[cfg(not(windows))]
pub fn install() {
    // Windows 以外では何もしない。
}

/// STATUS_ILLEGAL_INSTRUCTION = 0xC000001D
const STATUS_ILLEGAL_INSTRUCTION: u32 = 0xC000_001D;

/// 与えられた例外コードを crash.log へ記録すべきか判定する。
/// 注入 DLL 由来で問題になった不正命令例外のみを対象とし、
/// 通常の Rust panic 等が起こすその他の例外は対象外（素通し）とする。
fn should_record(code: u32) -> bool {
    code == STATUS_ILLEGAL_INSTRUCTION
}

#[cfg(windows)]
unsafe extern "system" fn veh_handler(
    info: *mut windows::Win32::System::Diagnostics::Debug::EXCEPTION_POINTERS,
) -> i32 {
    // EXCEPTION_CONTINUE_SEARCH = 0（windows 0.52 に定数が無いため数値で指定）
    const EXCEPTION_CONTINUE_SEARCH: i32 = 0;

    if info.is_null() {
        return EXCEPTION_CONTINUE_SEARCH;
    }

    let rec = (*info).ExceptionRecord;
    if rec.is_null() {
        return EXCEPTION_CONTINUE_SEARCH;
    }

    let code = (*rec).ExceptionCode.0 as u32;

    if should_record(code) {
        let addr = (*rec).ExceptionAddress as usize;
        write_crash_log(code, addr);
    }

    EXCEPTION_CONTINUE_SEARCH
}

/// crash.log へ 1 行追記する。ハンドラ文脈で安全なよう、
/// 標準ファイル API による追記のみに留める（ロック・確保を最小化）。
#[cfg(windows)]
fn write_crash_log(code: u32, addr: usize) {
    use std::io::Write;

    let path = match crash_log_path() {
        Some(p) => p,
        None => return,
    };

    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        // 例: "VEH caught exception 0xc000001d at address 0x00007ffd12340c274"
        let _ = writeln!(
            f,
            "VEH caught exception 0x{:08x} at address 0x{:016x}",
            code, addr
        );
    }
}

/// crash.log のパス（%APPDATA%\ore-no-fusen\crash.log）。
#[cfg(windows)]
fn crash_log_path() -> Option<std::path::PathBuf> {
    let app_data = std::env::var("APPDATA").ok()?;
    let dir = std::path::PathBuf::from(app_data).join("ore-no-fusen");
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join("crash.log"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_illegal_instruction() {
        // 認定環境で注入DLLが起こした不正命令例外(0xC000001D)は記録対象。
        assert!(should_record(0xC000_001D));
    }

    #[test]
    fn ignores_other_exceptions() {
        // 通常起こりうる他の例外は記録しない（素通し）。
        // 0xC0000005 = アクセス違反, 0xC000_0094 = ゼロ除算, 0 = 非例外
        assert!(!should_record(0xC000_0005));
        assert!(!should_record(0xC000_0094));
        assert!(!should_record(0));
    }
}
