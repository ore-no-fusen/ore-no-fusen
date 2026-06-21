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
const STACK_STEP_Y_MIN: f64 = 28.0;
const LANE_STEP_Y_MIN: f64 = 28.0;
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

    let mut natural_y = first_lane_y;
    let mut compressed_y = first_lane_y;
    for lane in &lanes {
        let lane_y = if compressed_lanes {
            compressed_y
        } else {
            natural_y
        };
        let lane_height = if compressed_lanes {
            if lanes.len() == 1 {
                available_height
            } else {
                (lane_slot_height(lane, available_height, total_lane_weight) - LANE_GAP).max(0.0)
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
            compressed_y += lane_slot_height(lane, available_height, total_lane_weight);
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

    ((lane_height - note_height) / (max_stack_len - 1) as f64).clamp(STACK_STEP_Y_MIN, note_height)
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
    for (note_index, note) in column_notes.iter().enumerate() {
        positions.push(ArrangedPosition {
            path: note.path.clone(),
            x: column_x + STACK_STEP_X * note_index as f64,
            y: clamp(
                lane_y + stack_step_y * note_index as f64,
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

fn normalized_color(note: &ArrangeNote) -> String {
    note.background_color
        .as_deref()
        .unwrap_or(COLOR_YELLOW)
        .to_ascii_lowercase()
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
    fn folded_notes_use_folded_height_for_stack_step_y() {
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

        assert_eq!(second.y - first.y, FOLDED_HEIGHT);
        assert_eq!(third.y - second.y, FOLDED_HEIGHT);
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
}
