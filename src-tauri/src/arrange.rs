#![allow(dead_code)]

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

const START_OFFSET_X: f64 = 40.0;
const START_OFFSET_Y: f64 = 40.0;
const COLUMN_GAP: f64 = 20.0;
const LANE_GAP: f64 = 80.0;
const STACK_STEP_X: f64 = 18.0;
const STACK_STEP_Y_MIN: f64 = 50.0;
const LANE_STEP_Y_MIN: f64 = 50.0;
const FOLDED_HEIGHT: f64 = 40.0;
const UNTAGGED_LANE_HEIGHT_WEIGHT: f64 = 0.5;
const ALIGNED_COLOR_COUNT: usize = 3;
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

struct Lane<'a> {
    columns: Vec<Vec<&'a ArrangeNote>>,
    max_note_height: f64,
    max_stack_len: usize,
    natural_height: f64,
    is_untagged: bool,
}

pub(crate) fn calculate_arrange_by_tag_positions(
    notes: &[ArrangeNote],
    work_area: WorkArea,
) -> Vec<ArrangedPosition> {
    let mut tagged_groups: BTreeMap<String, Vec<&ArrangeNote>> = BTreeMap::new();
    let mut untagged_group: Vec<&ArrangeNote> = Vec::new();

    for note in notes {
        if let Some(tag) = note.tags.first() {
            tagged_groups.entry(tag.clone()).or_default().push(note);
        } else {
            untagged_group.push(note);
        }
    }

    let mut groups: Vec<(String, Vec<&ArrangeNote>)> = tagged_groups.into_iter().collect();
    groups.sort_by(|(tag_a, notes_a), (tag_b, notes_b)| {
        notes_b
            .len()
            .cmp(&notes_a.len())
            .then_with(|| tag_a.cmp(tag_b))
    });

    if !untagged_group.is_empty() {
        groups.push((String::new(), untagged_group));
    }

    let lanes: Vec<Lane<'_>> = groups
        .into_iter()
        .map(|(tag, group_notes)| build_lane(group_notes, tag.is_empty()))
        .collect();

    let mut positions = Vec::with_capacity(notes.len());

    if lanes.is_empty() {
        return positions;
    }

    let lane_start_x = work_area.x + START_OFFSET_X;
    let fixed_column_xs = fixed_column_xs(&lanes, lane_start_x);
    let extra_columns_start_x = fixed_column_xs[COLOR_BLUE_INDEX]
        + max_lane_color_column_width(&lanes, COLOR_BLUE_INDEX)
        + COLUMN_GAP;
    let first_lane_y = clamp(
        work_area.y + START_OFFSET_Y,
        work_area.y,
        work_area.y + work_area.height,
    );
    let available_height = (work_area.y + work_area.height - first_lane_y).max(0.0);
    let natural_total_height: f64 = lanes.iter().map(|lane| lane.natural_height).sum::<f64>()
        + LANE_GAP * lanes.len().saturating_sub(1) as f64;
    let compressed_lanes = natural_total_height > available_height;
    let total_lane_weight: f64 = if compressed_lanes {
        lanes.iter().map(lane_height_weight).sum()
    } else {
        0.0
    };
    let lane_slots: Vec<f64> = if compressed_lanes {
        lanes
            .iter()
            .map(|lane| lane_slot_height(lane, available_height, total_lane_weight))
            .collect()
    } else {
        Vec::new()
    };
    let compressed_start_y = if compressed_lanes {
        compressed_start_y(first_lane_y, &lane_slots, work_area)
    } else {
        first_lane_y
    };

    let mut natural_y = first_lane_y;
    let mut compressed_y = compressed_start_y;
    for (lane_index, lane) in lanes.iter().enumerate() {
        let lane_y = if compressed_lanes {
            compressed_y
        } else {
            natural_y
        };
        let lane_height = if compressed_lanes {
            if lanes.len() == 1 {
                available_height
            } else {
                (lane_slots[lane_index] - LANE_GAP).max(0.0)
            }
        } else {
            lane.natural_height
        };
        let stack_step_y = stack_step_y(lane_height, lane.max_note_height, lane.max_stack_len);

        for (column_index, column_notes) in
            lane.columns.iter().take(ALIGNED_COLOR_COUNT).enumerate()
        {
            append_column_positions(
                &mut positions,
                column_notes,
                fixed_column_xs[column_index],
                lane_y,
                stack_step_y,
                work_area,
            );
        }

        let mut current_x = extra_columns_start_x;
        for column_notes in lane.columns.iter().skip(ALIGNED_COLOR_COUNT) {
            if column_notes.is_empty() {
                continue;
            }

            append_column_positions(
                &mut positions,
                column_notes,
                current_x,
                lane_y,
                stack_step_y,
                work_area,
            );

            current_x += column_width(column_notes) + COLUMN_GAP;
        }

        if !compressed_lanes {
            natural_y += lane.natural_height + LANE_GAP;
        } else {
            compressed_y += lane_slots[lane_index];
        }
    }

    positions
}

fn build_lane(notes: Vec<&ArrangeNote>, is_untagged: bool) -> Lane<'_> {
    let columns = build_color_columns(notes);
    let max_note_height = columns
        .iter()
        .flat_map(|column| column.iter().map(|note| effective_height(note)))
        .fold(0.0_f64, f64::max);
    let max_stack_len = columns.iter().map(|column| column.len()).max().unwrap_or(0);
    let natural_height = max_note_height * max_stack_len.max(1) as f64;

    Lane {
        columns,
        max_note_height,
        max_stack_len,
        natural_height,
        is_untagged,
    }
}

fn fixed_column_xs(lanes: &[Lane<'_>], start_x: f64) -> [f64; ALIGNED_COLOR_COUNT] {
    let yellow_x = start_x;
    let red_x = yellow_x + max_lane_color_column_width(lanes, COLOR_YELLOW_INDEX) + COLUMN_GAP;
    let blue_x = red_x + max_lane_color_column_width(lanes, COLOR_RED_INDEX) + COLUMN_GAP;

    [yellow_x, red_x, blue_x]
}

fn max_lane_color_column_width(lanes: &[Lane<'_>], color_index: usize) -> f64 {
    lanes
        .iter()
        .map(|lane| column_width(&lane.columns[color_index]))
        .fold(0.0_f64, f64::max)
}

fn lane_height_weight(lane: &Lane<'_>) -> f64 {
    if lane.is_untagged {
        UNTAGGED_LANE_HEIGHT_WEIGHT
    } else {
        1.0
    }
}

fn lane_slot_height(lane: &Lane<'_>, available_height: f64, total_lane_weight: f64) -> f64 {
    if total_lane_weight == 0.0 {
        return 0.0;
    }

    (available_height * lane_height_weight(lane) / total_lane_weight).max(LANE_STEP_Y_MIN)
}

fn compressed_start_y(first_lane_y: f64, lane_slots: &[f64], work_area: WorkArea) -> f64 {
    let stack_span = lane_slots
        .iter()
        .take(lane_slots.len().saturating_sub(1))
        .sum::<f64>();
    let work_area_bottom = work_area.y + work_area.height;

    if first_lane_y + stack_span > work_area_bottom {
        (work_area_bottom - stack_span).max(work_area.y)
    } else {
        first_lane_y
    }
}

fn effective_height(note: &ArrangeNote) -> f64 {
    if note.folded {
        FOLDED_HEIGHT
    } else {
        note.height
    }
}

fn stack_step_y(lane_height: f64, note_height: f64, max_stack_len: usize) -> f64 {
    if max_stack_len <= 1 {
        return 0.0;
    }

    ((lane_height - note_height) / (max_stack_len - 1) as f64)
        .clamp(STACK_STEP_Y_MIN, note_height.max(STACK_STEP_Y_MIN))
}

fn column_width(column_notes: &[&ArrangeNote]) -> f64 {
    let max_width = column_notes
        .iter()
        .map(|note| note.width)
        .fold(0.0_f64, f64::max);
    let stack_width = STACK_STEP_X * column_notes.len().saturating_sub(1) as f64;
    max_width + stack_width
}

fn append_column_positions(
    positions: &mut Vec<ArrangedPosition>,
    column_notes: &[&ArrangeNote],
    column_x: f64,
    lane_y: f64,
    stack_step_y: f64,
    work_area: WorkArea,
) {
    let stack_span = stack_step_y * column_notes.len().saturating_sub(1) as f64;
    let work_area_bottom = work_area.y + work_area.height;
    let column_y = if lane_y + stack_span > work_area_bottom {
        (work_area_bottom - stack_span).max(work_area.y)
    } else {
        lane_y
    };

    for (note_index, note) in column_notes.iter().enumerate() {
        positions.push(ArrangedPosition {
            path: note.path.clone(),
            x: column_x + STACK_STEP_X * note_index as f64,
            y: clamp(
                column_y + stack_step_y * note_index as f64,
                work_area.y,
                work_area.y + work_area.height,
            ),
        });
    }
}

fn build_color_columns(notes: Vec<&ArrangeNote>) -> Vec<Vec<&ArrangeNote>> {
    let mut fixed_columns: Vec<Vec<&ArrangeNote>> = vec![Vec::new(); FIXED_COLORS.len()];
    let mut other_notes: Vec<&ArrangeNote> = Vec::new();

    for note in notes {
        match color_bucket(note) {
            ColorBucket::Fixed(index) => fixed_columns[index].push(note),
            ColorBucket::Other(_) => other_notes.push(note),
        }
    }

    if !other_notes.is_empty() {
        other_notes.sort_by(|a, b| {
            normalized_color(a)
                .cmp(&normalized_color(b))
                .then_with(|| a.path.cmp(&b.path))
        });
        fixed_columns.push(other_notes);
    }

    fixed_columns
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
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
    lane: String,
    x: f64,
    y: f64,
}

#[derive(Clone, Debug)]
struct Rule3LaneLayout<'a> {
    placed: Vec<Rule3PlacedNote<'a>>,
    lane_top: f64,
    lane_bottom: f64,
    right: f64,
    bottom: f64,
    height: f64,
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
            x: placed.x,
            y: placed.y,
        })
        .collect()
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
            lane: String::new(),
            x: bucket_x + RULE3_STEP_X * note_index as f64,
            y: bucket_y + RULE3_STEP_Y_MIN * note_index as f64,
        });
    }

    Rule3Layout {
        column_x,
        column_widths,
        lane_layouts,
        notes: all_notes,
        bucket_x,
        bucket_y,
    }
}

#[derive(Clone, Debug)]
struct Rule3Layout<'a> {
    column_x: Rule3ColumnX,
    column_widths: Rule3ColumnWidths,
    lane_layouts: Vec<Rule3LaneLayout<'a>>,
    notes: Vec<Rule3PlacedNote<'a>>,
    bucket_x: f64,
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
        lane_bottom: bottom,
        right,
        bottom,
        height: bottom - lane_top,
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

fn rule3_rects_overlap(a: &Rule3PlacedNote<'_>, b: &Rule3PlacedNote<'_>) -> bool {
    a.x < b.x + b.note.width
        && a.x + a.note.width > b.x
        && a.y < b.y + effective_height(b.note)
        && a.y + effective_height(a.note) > b.y
}

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

    fn assert_all_tops_within_work_area(positions: &[ArrangedPosition], work_area: WorkArea) {
        for position in positions {
            assert!(
                position.y >= work_area.y,
                "{} y={}",
                position.path,
                position.y
            );
            assert!(
                position.y <= work_area.y + work_area.height,
                "{} y={}",
                position.path,
                position.y
            );
        }
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
            vec!["white.md", "black.md", "untagged.md"]
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
            vec!["white.md", "untagged_blue.md"]
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
    fn color_columns_keep_fixed_order_and_unknown_last() {
        let notes = vec![
            note("yellow.md", &["tag"], Some(COLOR_YELLOW)),
            note("red.md", &["tag"], Some(COLOR_RED)),
            note("blue.md", &["tag"], Some(COLOR_BLUE)),
            note("white.md", &["tag"], Some(COLOR_WHITE)),
            note("black.md", &["tag"], Some(COLOR_BLACK)),
            note("unknown.md", &["tag"], Some("#123456")),
            note("none.md", &["tag"], None),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert_eq!(
            position(&positions, "none.md").x - position(&positions, "yellow.md").x,
            STACK_STEP_X
        );
        assert!(position(&positions, "yellow.md").x < position(&positions, "red.md").x);
        assert!(position(&positions, "red.md").x < position(&positions, "blue.md").x);
        assert!(position(&positions, "blue.md").x < position(&positions, "white.md").x);
        assert!(position(&positions, "white.md").x < position(&positions, "black.md").x);
        assert!(position(&positions, "black.md").x < position(&positions, "unknown.md").x);
    }

    #[test]
    fn tags_are_vertical_lanes_by_note_count_and_untagged_last() {
        let notes = vec![
            note("a1.md", &["A"], Some(COLOR_YELLOW)),
            note("a2.md", &["A"], Some(COLOR_RED)),
            note("a3.md", &["A"], Some(COLOR_BLUE)),
            note("b1.md", &["B"], Some(COLOR_YELLOW)),
            note("untagged.md", &[], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "a1.md").y < position(&positions, "b1.md").y);
        assert!(position(&positions, "b1.md").y < position(&positions, "untagged.md").y);
        assert_eq!(position(&positions, "a1.md").x, START_OFFSET_X);
        assert_eq!(position(&positions, "b1.md").x, START_OFFSET_X);
        assert_eq!(position(&positions, "untagged.md").x, START_OFFSET_X);
    }

    #[test]
    fn yellow_red_blue_columns_share_fixed_x_across_lanes() {
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
    }

    #[test]
    fn missing_middle_color_keeps_next_fixed_color_x_aligned() {
        let notes = vec![
            note("a_yellow.md", &["A"], Some(COLOR_YELLOW)),
            note("a_blue.md", &["A"], Some(COLOR_BLUE)),
            note("b_yellow.md", &["B"], Some(COLOR_YELLOW)),
            note("b_red.md", &["B"], Some(COLOR_RED)),
            note("b_blue.md", &["B"], Some(COLOR_BLUE)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert_eq!(
            position(&positions, "a_blue.md").x,
            position(&positions, "b_blue.md").x
        );
        assert!(position(&positions, "a_yellow.md").x < position(&positions, "a_blue.md").x);
        assert!(position(&positions, "b_red.md").x < position(&positions, "b_blue.md").x);
    }

    #[test]
    fn same_color_notes_are_stair_stepped_preserving_input_order() {
        let notes = vec![
            note("newest.md", &["tag"], Some(COLOR_YELLOW)),
            note("middle.md", &["tag"], Some(COLOR_YELLOW)),
            note("oldest.md", &["tag"], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());
        let newest = position(&positions, "newest.md");
        let middle = position(&positions, "middle.md");
        let oldest = position(&positions, "oldest.md");

        assert_eq!(middle.x - newest.x, STACK_STEP_X);
        assert_eq!(oldest.x - middle.x, STACK_STEP_X);
        assert!(newest.y < middle.y);
        assert!(middle.y < oldest.y);
    }

    #[test]
    fn many_tags_and_colors_keep_all_note_tops_inside_work_area() {
        let colors = [
            Some(COLOR_YELLOW),
            Some(COLOR_RED),
            Some(COLOR_BLUE),
            Some(COLOR_WHITE),
            Some(COLOR_BLACK),
        ];
        let mut notes = Vec::new();
        for tag_index in 0..24 {
            for color in colors {
                for note_index in 0..3 {
                    let mut note = note(
                        &format!("tag{}_{}_{}.md", tag_index, color.unwrap(), note_index),
                        &[&format!("tag{}", tag_index)],
                        color,
                    );
                    note.height = 180.0;
                    notes.push(note);
                }
            }
        }
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 900.0,
            height: 320.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);

        assert_all_tops_within_work_area(&positions, small_work_area);
    }

    #[test]
    fn sparse_lanes_use_large_stack_step_y() {
        let notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
            note("c.md", &["tag"], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());
        let first = position(&positions, "a.md");
        let second = position(&positions, "b.md");
        let third = position(&positions, "c.md");

        assert_eq!(second.y - first.y, 100.0);
        assert_eq!(third.y - second.y, 100.0);
    }

    #[test]
    fn single_compressed_lane_uses_full_available_height_for_stack_step_y() {
        let notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
            note("c.md", &["tag"], Some(COLOR_YELLOW)),
        ];
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 400.0,
            height: 160.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);
        let first = position(&positions, "a.md");
        let second = position(&positions, "b.md");
        let third = position(&positions, "c.md");

        assert_all_tops_within_work_area(&positions, small_work_area);
        assert_eq!(second.y - first.y, STACK_STEP_Y_MIN);
        assert_eq!(third.y - second.y, STACK_STEP_Y_MIN);
    }

    #[test]
    fn same_color_stack_step_y_never_goes_below_minimum() {
        let notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
            note("c.md", &["tag"], Some(COLOR_YELLOW)),
            note("d.md", &["tag"], Some(COLOR_YELLOW)),
        ];
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 400.0,
            height: 150.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);

        assert_all_tops_within_work_area(&positions, small_work_area);
        assert!(
            position(&positions, "b.md").y - position(&positions, "a.md").y >= STACK_STEP_Y_MIN
        );
        assert!(
            position(&positions, "c.md").y - position(&positions, "b.md").y >= STACK_STEP_Y_MIN
        );
        assert!(
            position(&positions, "d.md").y - position(&positions, "c.md").y >= STACK_STEP_Y_MIN
        );
    }

    #[test]
    fn folded_notes_still_use_minimum_stack_step_y() {
        let mut notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
            note("c.md", &["tag"], Some(COLOR_YELLOW)),
        ];
        for note in &mut notes {
            note.folded = true;
        }

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());
        let first = position(&positions, "a.md");
        let second = position(&positions, "b.md");
        let third = position(&positions, "c.md");

        assert_eq!(second.y - first.y, STACK_STEP_Y_MIN);
        assert_eq!(third.y - second.y, STACK_STEP_Y_MIN);
    }

    #[test]
    fn compressed_untagged_lane_gets_deeper_overlap_than_tagged_lane() {
        let notes = vec![
            note("tagged_1.md", &["tag"], Some(COLOR_YELLOW)),
            note("tagged_2.md", &["tag"], Some(COLOR_YELLOW)),
            note("tagged_3.md", &["tag"], Some(COLOR_YELLOW)),
            note("untagged_1.md", &[], Some(COLOR_YELLOW)),
            note("untagged_2.md", &[], Some(COLOR_YELLOW)),
            note("untagged_3.md", &[], Some(COLOR_YELLOW)),
        ];
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 600.0,
            height: 660.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);
        let tagged_step =
            position(&positions, "tagged_2.md").y - position(&positions, "tagged_1.md").y;
        let untagged_step =
            position(&positions, "untagged_2.md").y - position(&positions, "untagged_1.md").y;

        assert_all_tops_within_work_area(&positions, small_work_area);
        assert!(untagged_step < tagged_step);
    }

    #[test]
    fn compressed_lanes_distribute_starts_before_bottom_edge() {
        let mut notes = Vec::new();
        for tag_index in 0..8 {
            for note_index in 0..3 {
                let mut note = note(
                    &format!("tag{}_{}.md", tag_index, note_index),
                    &[&format!("tag{}", tag_index)],
                    Some(COLOR_YELLOW),
                );
                note.height = 120.0;
                notes.push(note);
            }
        }
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 600.0,
            height: 360.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);
        let bottom = small_work_area.y + small_work_area.height;

        assert_all_tops_within_work_area(&positions, small_work_area);
        assert!(position(&positions, "tag7_0.md").y < bottom);
        assert!(
            position(&positions, "tag1_0.md").y - position(&positions, "tag0_0.md").y
                >= LANE_STEP_Y_MIN
        );
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

        assert_eq!(placed(&layout, "white.md").x, layout.bucket_x);
        assert_eq!(
            placed(&layout, "black.md").x,
            layout.bucket_x + RULE3_STEP_X
        );
        assert_eq!(
            placed(&layout, "unknown.md").x,
            layout.bucket_x + RULE3_STEP_X * 2.0
        );
        assert_eq!(
            placed(&layout, "untagged.md").x,
            layout.bucket_x + RULE3_STEP_X * 3.0
        );
        assert_eq!(placed(&layout, "white.md").y, layout.bucket_y);
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
