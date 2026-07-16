use std::collections::BTreeMap;

pub(crate) const COLOR_YELLOW: &str = "#f7e9b0";
pub(crate) const COLOR_RED: &str = "#ffcdd2";
pub(crate) const COLOR_BLUE: &str = "#80d8ff";
pub(crate) const COLOR_WHITE: &str = "#fafaf0";
pub(crate) const COLOR_BLACK: &str = "#cfd8dc";

const FIXED_COLORS: [&str; 5] = [
    COLOR_YELLOW,
    COLOR_RED,
    COLOR_BLUE,
    COLOR_WHITE,
    COLOR_BLACK,
];

const FOLDED_HEIGHT: f64 = 40.0;
const COLOR_YELLOW_INDEX: usize = 0;
const COLOR_RED_INDEX: usize = 1;
const COLOR_BLUE_INDEX: usize = 2;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ArrangeNote {
    pub path: String,
    pub tags: Vec<String>,
    pub background_color: Option<String>,
    pub width: f64,
    pub height: f64,
    pub folded: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct WorkArea {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ArrangedPosition {
    pub path: String,
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
enum ColorBucket {
    Fixed(usize),
    Other(String),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ColorRole {
    Yellow,
    Red,
    Blue,
    Extra,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum NotePlacement {
    Kanban { tag: String, color_role: ColorRole },
    Other,
}

struct LaneGroup<'a> {
    tag: String,
    notes: Vec<&'a ArrangeNote>,
}

struct GroupedNotes<'a> {
    lanes: Vec<LaneGroup<'a>>,
    bucket: Vec<&'a ArrangeNote>,
}

pub(crate) fn calculate_arrange_by_tag_positions(
    notes: &[ArrangeNote],
    work_area: WorkArea,
) -> Vec<ArrangedPosition> {
    calculate_arrange_rule3_positions(notes, work_area)
}

fn effective_height(note: &ArrangeNote) -> f64 {
    if note.folded {
        FOLDED_HEIGHT
    } else {
        note.height
    }
}

fn color_bucket(note: &ArrangeNote) -> ColorBucket {
    let color = normalized_color(note);
    match FIXED_COLORS.iter().position(|fixed| *fixed == color) {
        Some(index) => ColorBucket::Fixed(index),
        None => ColorBucket::Other(color),
    }
}

fn classify(note: &ArrangeNote) -> NotePlacement {
    let Some(tag) = note.tags.first() else {
        return NotePlacement::Other;
    };

    let color_role = match color_bucket(note) {
        ColorBucket::Fixed(COLOR_YELLOW_INDEX) => ColorRole::Yellow,
        ColorBucket::Fixed(COLOR_RED_INDEX) => ColorRole::Red,
        ColorBucket::Fixed(COLOR_BLUE_INDEX) => ColorRole::Blue,
        ColorBucket::Fixed(_) | ColorBucket::Other(_) => ColorRole::Extra,
    };

    NotePlacement::Kanban {
        tag: tag.clone(),
        color_role,
    }
}

fn group_notes_by_kanban_lane(notes: &[ArrangeNote]) -> GroupedNotes<'_> {
    let mut lanes_by_tag: BTreeMap<String, Vec<&ArrangeNote>> = BTreeMap::new();
    let mut bucket = Vec::new();

    for note in notes {
        match classify(note) {
            NotePlacement::Kanban {
                tag,
                color_role: ColorRole::Yellow | ColorRole::Red | ColorRole::Blue,
            } => {
                lanes_by_tag.entry(tag).or_default().push(note);
            }
            NotePlacement::Kanban {
                color_role: ColorRole::Extra,
                ..
            }
            | NotePlacement::Other => bucket.push(note),
        }
    }

    bucket.sort_by(|a, b| bucket_rank(a).cmp(&bucket_rank(b)));

    let mut lanes: Vec<LaneGroup<'_>> = lanes_by_tag
        .into_iter()
        .map(|(tag, notes)| LaneGroup { tag, notes })
        .collect();
    lanes.sort_by(|a, b| {
        let (a_yellow, a_red, a_blue) = lane_color_counts(a);
        let (b_yellow, b_red, b_blue) = lane_color_counts(b);

        b_yellow
            .cmp(&a_yellow)
            .then_with(|| b_red.cmp(&a_red))
            .then_with(|| b_blue.cmp(&a_blue))
            .then_with(|| a.tag.cmp(&b.tag))
    });

    GroupedNotes { lanes, bucket }
}

fn bucket_rank(note: &ArrangeNote) -> usize {
    match classify(note) {
        NotePlacement::Other => 0,
        NotePlacement::Kanban { .. } => 1,
    }
}

fn lane_color_counts(lane: &LaneGroup<'_>) -> (usize, usize, usize) {
    let mut yellow = 0;
    let mut red = 0;
    let mut blue = 0;

    for note in &lane.notes {
        match classify(note) {
            NotePlacement::Kanban {
                color_role: ColorRole::Yellow,
                ..
            } => yellow += 1,
            NotePlacement::Kanban {
                color_role: ColorRole::Red,
                ..
            } => red += 1,
            NotePlacement::Kanban {
                color_role: ColorRole::Blue,
                ..
            } => blue += 1,
            NotePlacement::Kanban { .. } | NotePlacement::Other => {}
        }
    }

    (yellow, red, blue)
}

fn normalized_color(note: &ArrangeNote) -> String {
    note.background_color
        .as_deref()
        .unwrap_or(COLOR_YELLOW)
        .to_ascii_lowercase()
}

const RULE3_START_X: f64 = 40.0;
const RULE3_START_Y: f64 = 40.0;
const RULE3_STEP_X: f64 = 18.0;
const RULE3_STEP_Y_MIN: f64 = 50.0;
const RULE3_COL_GAP: f64 = 16.0;
const RULE3_LANE_GAP: f64 = 48.0;
const RULE3_BUCKET_GAP: f64 = 40.0;
const RULE3_EMPTY_COLUMN_WIDTH: f64 = 180.0;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rule3StairMetrics {
    width: f64,
    height: f64,
    count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rule3ColumnWidths {
    yellow: f64,
    red: f64,
    blue: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Rule3ColumnX {
    yellow: f64,
    red: f64,
    blue: f64,
}

#[derive(Clone, Debug)]
struct Rule3PlacedNote<'a> {
    note: &'a ArrangeNote,
    #[cfg(test)]
    lane: String,
    x: f64,
    y: f64,
}

#[derive(Clone, Debug)]
struct Rule3LaneLayout<'a> {
    placed: Vec<Rule3PlacedNote<'a>>,
    lane_top: f64,
    #[cfg(test)]
    lane_bottom: f64,
    right: f64,
    bottom: f64,
}

pub(crate) fn calculate_arrange_rule3_positions(
    notes: &[ArrangeNote],
    work_area: WorkArea,
) -> Vec<ArrangedPosition> {
    let layout = layout_rule3(notes, work_area);

    layout
        .notes
        .into_iter()
        .map(|placed| ArrangedPosition {
            path: placed.note.path.clone(),
            x: clamp_note_x_to_work_area(placed.x, placed.note.width, work_area),
            y: placed.y,
        })
        .collect()
}

pub(crate) fn arrange_width_for_window(
    stored_width: f64,
    folded: bool,
    current_window_width: Option<f64>,
) -> f64 {
    if folded {
        current_window_width
            .filter(|width| width.is_finite() && *width > 0.0)
            .unwrap_or(stored_width)
    } else {
        stored_width
    }
}

pub(crate) fn arrange_size_for_window(
    stored_width: Option<f64>,
    stored_height: Option<f64>,
    folded: bool,
    current_window_size: Option<(f64, f64)>,
) -> Option<(f64, f64)> {
    let current_width = current_window_size.map(|(width, _)| width);
    let width = stored_width
        .or(current_width)
        .map(|width| arrange_width_for_window(width, folded, current_width))?;
    let height = stored_height.or(current_window_size.map(|(_, height)| height))?;
    (width.is_finite() && width > 0.0 && height.is_finite() && height > 0.0)
        .then_some((width, height))
}

fn clamp_note_x_to_work_area(x: f64, note_width: f64, work_area: WorkArea) -> f64 {
    let left = work_area.x;
    let rightmost_x = if note_width.is_finite() && note_width > 0.0 {
        (work_area.x + work_area.width - note_width).max(left)
    } else {
        work_area.x + work_area.width
    };
    x.clamp(left, rightmost_x)
}

fn layout_rule3(notes: &[ArrangeNote], work_area: WorkArea) -> Rule3Layout<'_> {
    let grouped = group_notes_by_kanban_lane(notes);
    let column_widths = compute_rule3_column_widths(&grouped.lanes);
    let column_x = compute_rule3_column_x(column_widths, work_area);
    let mut lane_layouts: Vec<Rule3LaneLayout<'_>> = Vec::new();
    let mut all_notes = Vec::new();
    let mut cursor_y = work_area.y + RULE3_START_Y;

    for (lane_index, lane) in grouped.lanes.iter().enumerate() {
        let base_y = cursor_y;
        let base_layout = build_rule3_lane_layout(lane, column_x, column_widths, base_y);
        let mut lane_layout = base_layout.clone();

        if lane_index > 0
            && rule3_disjoint(
                &rule3_lane_color_set(lane),
                &rule3_lane_color_set(&grouped.lanes[lane_index - 1]),
            )
        {
            let lifted_y = constrained_rule3_lift_y(
                &lane_layout.placed,
                &lane_layouts[lane_index - 1].placed,
                base_y,
                &lane_layouts[lane_index - 1],
                work_area,
            );
            lane_layout = build_rule3_lane_layout(lane, column_x, column_widths, lifted_y);
        }

        all_notes.extend(lane_layout.placed.iter().cloned());
        cursor_y = base_layout.bottom + RULE3_LANE_GAP;
        lane_layouts.push(lane_layout);
    }

    let first_lane_right = lane_layouts
        .first()
        .map(|layout| layout.right)
        .unwrap_or(column_x.blue + column_widths.blue);
    let bucket_x = first_lane_right + RULE3_BUCKET_GAP;
    let bucket_y = work_area.y + RULE3_START_Y;

    for (note_index, note) in grouped.bucket.iter().enumerate() {
        all_notes.push(Rule3PlacedNote {
            note,
            #[cfg(test)]
            lane: String::new(),
            x: bucket_x + RULE3_STEP_X * note_index as f64,
            y: bucket_y + RULE3_STEP_Y_MIN * note_index as f64,
        });
    }

    Rule3Layout {
        #[cfg(test)]
        column_x,
        #[cfg(test)]
        column_widths,
        #[cfg(test)]
        lane_layouts,
        notes: all_notes,
        #[cfg(test)]
        bucket_x,
        #[cfg(test)]
        bucket_y,
    }
}

#[derive(Clone, Debug)]
struct Rule3Layout<'a> {
    #[cfg(test)]
    column_x: Rule3ColumnX,
    #[cfg(test)]
    column_widths: Rule3ColumnWidths,
    #[cfg(test)]
    lane_layouts: Vec<Rule3LaneLayout<'a>>,
    notes: Vec<Rule3PlacedNote<'a>>,
    #[cfg(test)]
    bucket_x: f64,
    #[cfg(test)]
    bucket_y: f64,
}

fn stair_rule3_metrics(items: &[&ArrangeNote], step_y: f64) -> Rule3StairMetrics {
    let mut width = 0.0_f64;
    let mut height = 0.0_f64;

    for (index, note) in items.iter().enumerate() {
        width = width.max(note.width + RULE3_STEP_X * index as f64);
        height = height.max(effective_height(note) + step_y * index as f64);
    }

    Rule3StairMetrics {
        width,
        height,
        count: items.len(),
    }
}

fn compute_rule3_column_widths(lanes: &[LaneGroup<'_>]) -> Rule3ColumnWidths {
    let mut widths = Rule3ColumnWidths {
        yellow: 0.0,
        red: 0.0,
        blue: 0.0,
    };

    for lane in lanes {
        widths.yellow = widths.yellow.max(
            stair_rule3_metrics(
                &rule3_notes_by_color(lane, ColorRole::Yellow),
                RULE3_STEP_Y_MIN,
            )
            .width,
        );
        widths.red = widths.red.max(
            stair_rule3_metrics(
                &rule3_notes_by_color(lane, ColorRole::Red),
                RULE3_STEP_Y_MIN,
            )
            .width,
        );
        widths.blue = widths.blue.max(
            stair_rule3_metrics(
                &rule3_notes_by_color(lane, ColorRole::Blue),
                RULE3_STEP_Y_MIN,
            )
            .width,
        );
    }

    if widths.yellow == 0.0 {
        widths.yellow = RULE3_EMPTY_COLUMN_WIDTH;
    }
    if widths.red == 0.0 {
        widths.red = RULE3_EMPTY_COLUMN_WIDTH;
    }
    if widths.blue == 0.0 {
        widths.blue = RULE3_EMPTY_COLUMN_WIDTH;
    }

    widths
}

fn compute_rule3_column_x(widths: Rule3ColumnWidths, work_area: WorkArea) -> Rule3ColumnX {
    let yellow = work_area.x + RULE3_START_X;
    let red = yellow + widths.yellow + RULE3_COL_GAP;
    let blue = red + widths.red + RULE3_COL_GAP;

    Rule3ColumnX { yellow, red, blue }
}

fn build_rule3_lane_layout<'a>(
    lane: &LaneGroup<'a>,
    column_x: Rule3ColumnX,
    column_widths: Rule3ColumnWidths,
    proposed_y: f64,
) -> Rule3LaneLayout<'a> {
    let mut placed = Vec::new();

    append_rule3_color_positions(
        &mut placed,
        lane,
        ColorRole::Yellow,
        column_x.yellow,
        proposed_y,
    );
    append_rule3_color_positions(&mut placed, lane, ColorRole::Red, column_x.red, proposed_y);
    append_rule3_color_positions(
        &mut placed,
        lane,
        ColorRole::Blue,
        column_x.blue,
        proposed_y,
    );

    let right = placed
        .iter()
        .map(|item| item.x + item.note.width)
        .fold(column_x.blue + column_widths.blue, f64::max);
    let lane_top = placed.iter().map(|item| item.y).fold(proposed_y, f64::min);
    let bottom = placed
        .iter()
        .map(|item| item.y + effective_height(item.note))
        .fold(proposed_y, f64::max);

    Rule3LaneLayout {
        placed,
        lane_top,
        #[cfg(test)]
        lane_bottom: bottom,
        right,
        bottom,
    }
}

fn append_rule3_color_positions<'a>(
    placed: &mut Vec<Rule3PlacedNote<'a>>,
    lane: &LaneGroup<'a>,
    color_role: ColorRole,
    column_x: f64,
    proposed_y: f64,
) {
    let mut color_index = 0;

    for note in &lane.notes {
        if rule3_note_color_role(note) != Some(color_role) {
            continue;
        }

        placed.push(Rule3PlacedNote {
            note,
            #[cfg(test)]
            lane: lane.tag.clone(),
            x: column_x + RULE3_STEP_X * color_index as f64,
            y: proposed_y + RULE3_STEP_Y_MIN * color_index as f64,
        });
        color_index += 1;
    }
}

fn lowest_non_colliding_rule3_y(
    candidate_rects: &[Rule3PlacedNote<'_>],
    fixed_rects: &[Rule3PlacedNote<'_>],
    base_y: f64,
    work_area: WorkArea,
) -> f64 {
    let mut min_y = work_area.y + RULE3_START_Y;

    for fixed in fixed_rects {
        for candidate in candidate_rects {
            let same_x_range = candidate.x < fixed.x + fixed.note.width
                && candidate.x + candidate.note.width > fixed.x;
            if !same_x_range {
                continue;
            }

            let offset_y = candidate.y - base_y;
            min_y = min_y.max(fixed.y + effective_height(fixed.note) - offset_y);
        }
    }

    min_y
}

fn previous_rule3_lane_lift_floor(previous_lane: &Rule3LaneLayout<'_>) -> f64 {
    let candidates: Vec<&Rule3PlacedNote<'_>> = previous_lane
        .placed
        .iter()
        .filter(|item| rule3_note_color_role(item.note) == Some(ColorRole::Yellow))
        .collect();
    let candidates = if candidates.is_empty() {
        previous_lane.placed.iter().collect()
    } else {
        candidates
    };
    let lowest = candidates
        .into_iter()
        .max_by(|a, b| {
            (a.y + effective_height(a.note))
                .partial_cmp(&(b.y + effective_height(b.note)))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .expect("previous lane must contain at least one note");

    lowest.y + effective_height(lowest.note) / 2.0
}

fn constrained_rule3_lift_y(
    candidate_rects: &[Rule3PlacedNote<'_>],
    previous_rects: &[Rule3PlacedNote<'_>],
    base_y: f64,
    previous_lane: &Rule3LaneLayout<'_>,
    work_area: WorkArea,
) -> f64 {
    let non_colliding_y =
        lowest_non_colliding_rule3_y(candidate_rects, previous_rects, base_y, work_area);
    let intrusion_ceiling_y = previous_rule3_lane_lift_floor(previous_lane);
    let monotonic_y = previous_lane.lane_top + 1.0;
    let safe_y = non_colliding_y.max(monotonic_y);

    base_y.min(intrusion_ceiling_y.max(safe_y))
}

fn rule3_notes_by_color<'a>(
    lane: &'a LaneGroup<'a>,
    color_role: ColorRole,
) -> Vec<&'a ArrangeNote> {
    lane.notes
        .iter()
        .copied()
        .filter(|note| rule3_note_color_role(note) == Some(color_role))
        .collect()
}

fn rule3_note_color_role(note: &ArrangeNote) -> Option<ColorRole> {
    match classify(note) {
        NotePlacement::Kanban { color_role, .. } => match color_role {
            ColorRole::Yellow | ColorRole::Red | ColorRole::Blue => Some(color_role),
            ColorRole::Extra => None,
        },
        NotePlacement::Other => None,
    }
}

fn rule3_lane_color_set(lane: &LaneGroup<'_>) -> Vec<ColorRole> {
    let mut colors = Vec::new();

    for note in &lane.notes {
        let Some(color_role) = rule3_note_color_role(note) else {
            continue;
        };
        if !colors.contains(&color_role) {
            colors.push(color_role);
        }
    }

    colors
}

fn rule3_disjoint(a: &[ColorRole], b: &[ColorRole]) -> bool {
    a.iter().all(|color| !b.contains(color))
}

#[cfg(test)]
fn rule3_rects_overlap(a: &Rule3PlacedNote<'_>, b: &Rule3PlacedNote<'_>) -> bool {
    a.x < b.x + b.note.width
        && a.x + a.note.width > b.x
        && a.y < b.y + effective_height(b.note)
        && a.y + effective_height(a.note) > b.y
}

#[cfg(test)]
fn check_rule3_no_cross_tag_collision(notes: &[Rule3PlacedNote<'_>]) -> Result<(), String> {
    for i in 0..notes.len() {
        for j in i + 1..notes.len() {
            if notes[i].lane != notes[j].lane && rule3_rects_overlap(&notes[i], &notes[j]) {
                return Err(format!(
                    "cross-tag collision: {} / {}",
                    notes[i].note.path, notes[j].note.path
                ));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
fn check_rule3_lane_top_monotonic(lanes: &[Rule3LaneLayout<'_>]) -> Result<(), String> {
    for index in 1..lanes.len() {
        if lanes[index].lane_top <= lanes[index - 1].lane_top {
            return Err(format!(
                "lane top is not monotonic: {} <= {}",
                lanes[index].lane_top,
                lanes[index - 1].lane_top
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
fn check_rule3_lane_y_bounds(lanes: &[Rule3LaneLayout<'_>]) -> Result<(), String> {
    for lane in lanes {
        for item in &lane.placed {
            if item.y < lane.lane_top || item.y + effective_height(item.note) > lane.lane_bottom {
                return Err(format!("note is outside lane y bounds: {}", item.note.path));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(path: &str, tags: &[&str], color: Option<&str>) -> ArrangeNote {
        ArrangeNote {
            path: path.to_string(),
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            background_color: color.map(|value| value.to_string()),
            width: 100.0,
            height: 100.0,
            folded: false,
        }
    }

    fn work_area() -> WorkArea {
        WorkArea {
            x: 0.0,
            y: 0.0,
            width: 2000.0,
            height: 1000.0,
        }
    }

    fn position<'a>(positions: &'a [ArrangedPosition], path: &str) -> &'a ArrangedPosition {
        positions
            .iter()
            .find(|position| position.path == path)
            .unwrap()
    }

    fn placed<'a>(layout: &'a Rule3Layout<'_>, path: &str) -> &'a Rule3PlacedNote<'a> {
        layout
            .notes
            .iter()
            .find(|position| position.note.path == path)
            .unwrap()
    }

    fn note_paths(notes: &[&ArrangeNote]) -> Vec<String> {
        notes.iter().map(|note| note.path.clone()).collect()
    }

    #[test]
    fn classify_tagged_yellow_as_kanban_yellow() {
        assert_eq!(
            classify(&note("yellow.md", &["tag"], Some(COLOR_YELLOW))),
            NotePlacement::Kanban {
                tag: "tag".to_string(),
                color_role: ColorRole::Yellow,
            }
        );
    }

    #[test]
    fn classify_tagged_white_as_kanban_extra() {
        assert_eq!(
            classify(&note("white.md", &["tag"], Some(COLOR_WHITE))),
            NotePlacement::Kanban {
                tag: "tag".to_string(),
                color_role: ColorRole::Extra,
            }
        );
    }

    #[test]
    fn classify_tagged_unknown_color_as_kanban_extra() {
        assert_eq!(
            classify(&note("unknown.md", &["tag"], Some("#123456"))),
            NotePlacement::Kanban {
                tag: "tag".to_string(),
                color_role: ColorRole::Extra,
            }
        );
    }

    #[test]
    fn classify_untagged_blue_as_other() {
        assert_eq!(
            classify(&note("untagged_blue.md", &[], Some(COLOR_BLUE))),
            NotePlacement::Other
        );
    }

    #[test]
    fn classify_untagged_none_as_other() {
        assert_eq!(
            classify(&note("untagged_none.md", &[], None)),
            NotePlacement::Other
        );
    }

    #[test]
    fn kanban_lanes_sort_by_yellow_red_blue_counts_then_tag() {
        let notes = vec![
            note("b_yellow_1.md", &["B"], Some(COLOR_YELLOW)),
            note("a_yellow_1.md", &["A"], Some(COLOR_YELLOW)),
            note("b_yellow_2.md", &["B"], Some(COLOR_YELLOW)),
            note("a_yellow_2.md", &["A"], Some(COLOR_YELLOW)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
            note("a_red.md", &["A"], Some(COLOR_RED)),
        ];

        let grouped = group_notes_by_kanban_lane(&notes);

        assert_eq!(
            grouped
                .lanes
                .iter()
                .map(|lane| lane.tag.as_str())
                .collect::<Vec<_>>(),
            vec!["A", "B"]
        );
    }

    #[test]
    fn white_black_and_untagged_notes_go_to_bucket() {
        let notes = vec![
            note("white.md", &["tag"], Some(COLOR_WHITE)),
            note("black.md", &["tag"], Some(COLOR_BLACK)),
            note("untagged.md", &[], Some(COLOR_YELLOW)),
        ];

        let grouped = group_notes_by_kanban_lane(&notes);

        assert!(grouped.lanes.is_empty());
        assert_eq!(
            note_paths(&grouped.bucket),
            vec!["untagged.md", "white.md", "black.md"]
        );
    }

    #[test]
    fn only_kanban_yellow_red_blue_notes_go_to_lanes() {
        let notes = vec![
            note("yellow.md", &["tag"], Some(COLOR_YELLOW)),
            note("red.md", &["tag"], Some(COLOR_RED)),
            note("blue.md", &["tag"], Some(COLOR_BLUE)),
            note("white.md", &["tag"], Some(COLOR_WHITE)),
            note("untagged_blue.md", &[], Some(COLOR_BLUE)),
        ];

        let grouped = group_notes_by_kanban_lane(&notes);

        assert_eq!(grouped.lanes.len(), 1);
        assert_eq!(
            note_paths(&grouped.lanes[0].notes),
            vec!["yellow.md", "red.md", "blue.md"]
        );
        assert_eq!(
            note_paths(&grouped.bucket),
            vec!["untagged_blue.md", "white.md"]
        );
    }

    #[test]
    fn lane_notes_preserve_input_order() {
        let notes = vec![
            note("first.md", &["tag"], Some(COLOR_BLUE)),
            note("second.md", &["tag"], Some(COLOR_YELLOW)),
            note("third.md", &["tag"], Some(COLOR_RED)),
        ];

        let grouped = group_notes_by_kanban_lane(&notes);

        assert_eq!(
            note_paths(&grouped.lanes[0].notes),
            vec!["first.md", "second.md", "third.md"]
        );
    }

    #[test]
    fn public_arrange_uses_rule3_basic_columns() {
        let notes = vec![
            note("a_yellow.md", &["A"], Some(COLOR_YELLOW)),
            note("a_red.md", &["A"], Some(COLOR_RED)),
            note("a_blue.md", &["A"], Some(COLOR_BLUE)),
            note("b_yellow.md", &["B"], Some(COLOR_YELLOW)),
            note("b_red.md", &["B"], Some(COLOR_RED)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert_eq!(
            position(&positions, "a_yellow.md").x,
            position(&positions, "b_yellow.md").x
        );
        assert_eq!(
            position(&positions, "a_red.md").x,
            position(&positions, "b_red.md").x
        );
        assert_eq!(
            position(&positions, "a_blue.md").x,
            position(&positions, "b_blue.md").x
        );
        assert!(position(&positions, "a_yellow.md").x < position(&positions, "a_red.md").x);
        assert!(position(&positions, "a_red.md").x < position(&positions, "a_blue.md").x);
        assert_eq!(position(&positions, "a_yellow.md").x, RULE3_START_X);
    }

    #[test]
    fn public_arrange_uses_rule3_lift_for_disjoint_lanes() {
        let notes = vec![
            note("a_yellow.md", &["A"], Some(COLOR_YELLOW)),
            note("a_yellow_2.md", &["A"], Some(COLOR_YELLOW)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());
        let first_lane_bottom = position(&positions, "a_yellow_2.md").y + 100.0;
        let second_base_y = first_lane_bottom + RULE3_LANE_GAP;

        assert!(position(&positions, "b_blue.md").y < second_base_y);
        assert!(position(&positions, "a_yellow.md").y < position(&positions, "b_blue.md").y);
    }

    #[test]
    fn public_arrange_puts_bucket_to_right_with_untagged_first() {
        let notes = vec![
            note("lane.md", &["tag"], Some(COLOR_YELLOW)),
            note("tagged_white.md", &["tag"], Some(COLOR_WHITE)),
            note("untagged_blue.md", &[], Some(COLOR_BLUE)),
            note("tagged_black.md", &["tag"], Some(COLOR_BLACK)),
            note("untagged_red.md", &[], Some(COLOR_RED)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "lane.md").x < position(&positions, "untagged_blue.md").x);
        assert_eq!(
            position(&positions, "untagged_red.md").x - position(&positions, "untagged_blue.md").x,
            RULE3_STEP_X
        );
        assert_eq!(
            position(&positions, "tagged_white.md").x - position(&positions, "untagged_red.md").x,
            RULE3_STEP_X
        );
        assert_eq!(
            position(&positions, "tagged_black.md").x - position(&positions, "tagged_white.md").x,
            RULE3_STEP_X
        );
        assert!(
            position(&positions, "untagged_blue.md").y < position(&positions, "tagged_white.md").y
        );
    }

    #[test]
    fn folded_note_uses_its_current_window_width() {
        assert_eq!(arrange_width_for_window(1200.0, true, Some(286.0)), 286.0);
        assert_eq!(arrange_width_for_window(1200.0, false, Some(286.0)), 1200.0);
    }

    #[test]
    fn imported_note_without_stored_size_uses_current_window_size() {
        assert_eq!(
            arrange_size_for_window(None, None, false, Some((640.0, 480.0))),
            Some((640.0, 480.0))
        );
    }

    #[test]
    fn public_arrange_keeps_each_note_horizontally_reachable() {
        let mut huge = note("huge.md", &["tag"], Some(COLOR_YELLOW));
        huge.width = 450.0;
        let notes = vec![
            huge,
            note("red.md", &["tag"], Some(COLOR_RED)),
            note("blue.md", &["tag"], Some(COLOR_BLUE)),
            note("bucket.md", &[], Some(COLOR_WHITE)),
        ];
        let work_area = WorkArea { x: 0.0, y: 0.0, width: 500.0, height: 800.0 };

        let positions = calculate_arrange_by_tag_positions(&notes, work_area);

        for note in &notes {
            let x = position(&positions, &note.path).x;
            assert!(x >= work_area.x);
            assert!(x + note.width.min(work_area.width) <= work_area.x + work_area.width);
        }
    }

    #[test]
    fn rule3_lanes_sort_by_yellow_red_blue_counts_then_tag() {
        let notes = vec![
            note("b_yellow_1.md", &["B"], Some(COLOR_YELLOW)),
            note("a_yellow_1.md", &["A"], Some(COLOR_YELLOW)),
            note("b_yellow_2.md", &["B"], Some(COLOR_YELLOW)),
            note("a_yellow_2.md", &["A"], Some(COLOR_YELLOW)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
            note("a_red.md", &["A"], Some(COLOR_RED)),
        ];

        let layout = layout_rule3(&notes, work_area());

        assert_eq!(layout.lane_layouts.len(), 2);
        assert_eq!(layout.lane_layouts[0].placed[0].lane, "A");
        assert_eq!(layout.lane_layouts[1].placed[0].lane, "B");
    }

    #[test]
    fn rule3_same_color_notes_are_right_down_stairs() {
        let notes = vec![
            note("first.md", &["tag"], Some(COLOR_YELLOW)),
            note("second.md", &["tag"], Some(COLOR_YELLOW)),
            note("third.md", &["tag"], Some(COLOR_YELLOW)),
        ];

        let layout = layout_rule3(&notes, work_area());
        let first = placed(&layout, "first.md");
        let second = placed(&layout, "second.md");
        let third = placed(&layout, "third.md");

        assert_eq!(second.x - first.x, RULE3_STEP_X);
        assert_eq!(third.x - second.x, RULE3_STEP_X);
        assert_eq!(second.y - first.y, RULE3_STEP_Y_MIN);
        assert_eq!(third.y - second.y, RULE3_STEP_Y_MIN);
    }

    #[test]
    fn rule3_column_x_is_shared_across_lanes() {
        let notes = vec![
            note("a_yellow.md", &["A"], Some(COLOR_YELLOW)),
            note("a_red.md", &["A"], Some(COLOR_RED)),
            note("a_blue.md", &["A"], Some(COLOR_BLUE)),
            note("b_yellow.md", &["B"], Some(COLOR_YELLOW)),
            note("b_red.md", &["B"], Some(COLOR_RED)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
        ];

        let layout = layout_rule3(&notes, work_area());

        assert_eq!(
            placed(&layout, "a_yellow.md").x,
            placed(&layout, "b_yellow.md").x
        );
        assert_eq!(placed(&layout, "a_red.md").x, placed(&layout, "b_red.md").x);
        assert_eq!(
            placed(&layout, "a_blue.md").x,
            placed(&layout, "b_blue.md").x
        );
        assert_eq!(layout.column_x.yellow, RULE3_START_X);
        assert_eq!(
            layout.column_x.red,
            RULE3_START_X + layout.column_widths.yellow + RULE3_COL_GAP
        );
        assert_eq!(
            layout.column_x.blue,
            layout.column_x.red + layout.column_widths.red + RULE3_COL_GAP
        );
    }

    #[test]
    fn rule3_disjoint_lane_lifts_but_overlapping_color_does_not() {
        let notes = vec![
            note("a_yellow_1.md", &["A"], Some(COLOR_YELLOW)),
            note("a_yellow_2.md", &["A"], Some(COLOR_YELLOW)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
            note("c_blue.md", &["C"], Some(COLOR_BLUE)),
        ];

        let layout = layout_rule3(&notes, work_area());
        let first_lane = &layout.lane_layouts[0];
        let second_lane = &layout.lane_layouts[1];
        let third_lane = &layout.lane_layouts[2];
        let second_base_y = first_lane.bottom + RULE3_LANE_GAP;
        let third_base_y =
            second_base_y + effective_height(placed(&layout, "b_blue.md").note) + RULE3_LANE_GAP;

        assert!(second_lane.lane_top < second_base_y);
        assert_eq!(third_lane.lane_top, third_base_y);
    }

    #[test]
    fn rule3_bucket_receives_white_black_untagged_and_unknown_colors() {
        let notes = vec![
            note("lane.md", &["tag"], Some(COLOR_YELLOW)),
            note("white.md", &["tag"], Some(COLOR_WHITE)),
            note("black.md", &["tag"], Some(COLOR_BLACK)),
            note("unknown.md", &["tag"], Some("#123456")),
            note("untagged.md", &[], Some(COLOR_BLUE)),
        ];

        let layout = layout_rule3(&notes, work_area());

        assert_eq!(placed(&layout, "untagged.md").x, layout.bucket_x);
        assert_eq!(
            placed(&layout, "white.md").x,
            layout.bucket_x + RULE3_STEP_X
        );
        assert_eq!(
            placed(&layout, "black.md").x,
            layout.bucket_x + RULE3_STEP_X * 2.0
        );
        assert_eq!(
            placed(&layout, "unknown.md").x,
            layout.bucket_x + RULE3_STEP_X * 3.0
        );
        assert_eq!(placed(&layout, "untagged.md").y, layout.bucket_y);
    }

    #[test]
    fn rule3_debug_invariants_hold_for_basic_layout() {
        let notes = vec![
            note("a_yellow_1.md", &["A"], Some(COLOR_YELLOW)),
            note("a_yellow_2.md", &["A"], Some(COLOR_YELLOW)),
            note("a_blue.md", &["A"], Some(COLOR_BLUE)),
            note("b_red.md", &["B"], Some(COLOR_RED)),
            note("c_blue_1.md", &["C"], Some(COLOR_BLUE)),
            note("c_blue_2.md", &["C"], Some(COLOR_BLUE)),
            note("bucket.md", &[], Some(COLOR_WHITE)),
        ];

        let layout = layout_rule3(&notes, work_area());

        check_rule3_no_cross_tag_collision(&layout.notes).unwrap();
        check_rule3_lane_top_monotonic(&layout.lane_layouts).unwrap();
        check_rule3_lane_y_bounds(&layout.lane_layouts).unwrap();
    }
}
