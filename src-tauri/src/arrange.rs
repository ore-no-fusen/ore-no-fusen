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
const TAG_GAP: f64 = 40.0;
const ROW_GAP: f64 = 20.0;
const OVERFLOW_STEP_Y: f64 = 40.0;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ArrangeNote {
    pub path: String,
    pub tags: Vec<String>,
    pub background_color: Option<String>,
    pub width: f64,
    pub height: f64,
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

    let mut positions = Vec::with_capacity(notes.len());
    let row_start_x = work_area.x + START_OFFSET_X;
    let mut current_x = row_start_x;
    let mut current_y = work_area.y + START_OFFSET_Y;
    let mut row_max_bottom = current_y;
    let work_area_right = work_area.x + work_area.width;

    for (_, group_notes) in groups {
        let columns = build_color_columns(group_notes);
        let block_width = tag_block_width(&columns);

        if current_x > row_start_x && current_x + block_width > work_area_right {
            current_x = row_start_x;
            current_y = row_max_bottom + ROW_GAP;
            row_max_bottom = current_y;
        }

        for column_notes in columns {
            let column_x = current_x;
            let column_bottom = append_column_positions(
                &mut positions,
                &column_notes,
                column_x,
                current_y,
                work_area,
            );
            row_max_bottom = row_max_bottom.max(column_bottom);

            let max_width = column_notes
                .iter()
                .map(|note| note.width)
                .fold(0.0_f64, f64::max);
            current_x += max_width + COLUMN_GAP;
        }

        current_x += TAG_GAP;
    }

    positions
}

fn tag_block_width(columns: &[Vec<&ArrangeNote>]) -> f64 {
    columns
        .iter()
        .map(|column_notes| {
            column_notes
                .iter()
                .map(|note| note.width)
                .fold(0.0_f64, f64::max)
                + COLUMN_GAP
        })
        .sum()
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

    let mut columns = Vec::new();
    for mut column in fixed_columns {
        if column.is_empty() {
            continue;
        }
        column.sort_by(|a, b| a.path.cmp(&b.path));
        columns.push(column);
    }

    if !other_notes.is_empty() {
        other_notes.sort_by(|a, b| {
            normalized_color(a)
                .cmp(&normalized_color(b))
                .then_with(|| a.path.cmp(&b.path))
        });
        columns.push(other_notes);
    }

    columns
}

fn append_column_positions(
    positions: &mut Vec<ArrangedPosition>,
    column_notes: &[&ArrangeNote],
    column_x: f64,
    start_y: f64,
    work_area: WorkArea,
) -> f64 {
    let work_area_bottom = work_area.y + work_area.height;
    let mut previous_y = start_y;
    let mut previous_height = 0.0;
    let mut max_bottom = start_y;

    for (index, note) in column_notes.iter().enumerate() {
        let full_stack_y = if index == 0 {
            start_y
        } else {
            previous_y + previous_height + ROW_GAP
        };
        let y = if index > 0 && full_stack_y + note.height > work_area_bottom {
            previous_y + OVERFLOW_STEP_Y
        } else {
            full_stack_y
        };
        let (x, y) = contain_giant_note_top_left(column_x, y, *note, work_area);

        positions.push(ArrangedPosition {
            path: note.path.clone(),
            x,
            y,
        });

        max_bottom = max_bottom.max(y + note.height);
        previous_y = y;
        previous_height = note.height;
    }

    max_bottom
}

fn contain_giant_note_top_left(
    x: f64,
    y: f64,
    note: &ArrangeNote,
    work_area: WorkArea,
) -> (f64, f64) {
    let contained_x = if note.width > work_area.width {
        clamp(x, work_area.x, work_area.x + work_area.width)
    } else {
        x
    };
    let contained_y = if note.height > work_area.height {
        clamp(y, work_area.y, work_area.y + work_area.height)
    } else {
        y
    };

    (contained_x, contained_y)
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

    #[test]
    fn color_order_is_yellow_red_blue_white_black() {
        let notes = vec![
            note("yellow.md", &["tag"], Some(COLOR_YELLOW)),
            note("red.md", &["tag"], Some(COLOR_RED)),
            note("blue.md", &["tag"], Some(COLOR_BLUE)),
            note("white.md", &["tag"], Some(COLOR_WHITE)),
            note("black.md", &["tag"], Some(COLOR_BLACK)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "yellow.md").x < position(&positions, "red.md").x);
        assert!(position(&positions, "red.md").x < position(&positions, "blue.md").x);
        assert!(position(&positions, "blue.md").x < position(&positions, "white.md").x);
        assert!(position(&positions, "white.md").x < position(&positions, "black.md").x);
    }

    #[test]
    fn tag_with_more_notes_is_placed_left() {
        let notes = vec![
            note("a1.md", &["A"], Some(COLOR_YELLOW)),
            note("a2.md", &["A"], Some(COLOR_RED)),
            note("a3.md", &["A"], Some(COLOR_BLUE)),
            note("b1.md", &["B"], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "a1.md").x < position(&positions, "b1.md").x);
    }

    #[test]
    fn tag_blocks_wrap_to_next_row_when_work_area_width_overflows() {
        let notes = vec![
            note("a1.md", &["A"], Some(COLOR_YELLOW)),
            note("b1.md", &["B"], Some(COLOR_YELLOW)),
        ];
        let narrow_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 300.0,
            height: 1000.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, narrow_work_area);
        let a = position(&positions, "a1.md");
        let b = position(&positions, "b1.md");

        assert_eq!(a.x, START_OFFSET_X);
        assert_eq!(b.x, START_OFFSET_X);
        assert_eq!(b.y, a.y + 100.0 + ROW_GAP);
    }

    #[test]
    fn untagged_group_is_placed_rightmost() {
        let notes = vec![
            note("untagged.md", &[], Some(COLOR_YELLOW)),
            note("a1.md", &["A"], Some(COLOR_YELLOW)),
            note("b1.md", &["B"], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        let untagged_x = position(&positions, "untagged.md").x;
        assert!(position(&positions, "a1.md").x < untagged_x);
        assert!(position(&positions, "b1.md").x < untagged_x);
    }

    #[test]
    fn same_color_notes_are_stacked_vertically() {
        let notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());
        let first = position(&positions, "a.md");
        let second = position(&positions, "b.md");

        assert_eq!(first.x, second.x);
        assert!(first.y < second.y);
    }

    #[test]
    fn missing_background_color_is_treated_as_yellow() {
        let notes = vec![
            note("none.md", &["tag"], None),
            note("red.md", &["tag"], Some(COLOR_RED)),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "none.md").x < position(&positions, "red.md").x);
    }

    #[test]
    fn unknown_color_is_placed_right_of_black() {
        let notes = vec![
            note("black.md", &["tag"], Some(COLOR_BLACK)),
            note("unknown.md", &["tag"], Some("#123456")),
        ];

        let positions = calculate_arrange_by_tag_positions(&notes, work_area());

        assert!(position(&positions, "black.md").x < position(&positions, "unknown.md").x);
    }

    #[test]
    fn overflow_uses_card_like_overlap_step() {
        let notes = vec![
            note("a.md", &["tag"], Some(COLOR_YELLOW)),
            note("b.md", &["tag"], Some(COLOR_YELLOW)),
            note("c.md", &["tag"], Some(COLOR_YELLOW)),
        ];
        let small_work_area = WorkArea {
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 190.0,
        };

        let positions = calculate_arrange_by_tag_positions(&notes, small_work_area);
        let first = position(&positions, "a.md");
        let second = position(&positions, "b.md");
        let third = position(&positions, "c.md");

        assert_eq!(second.y - first.y, OVERFLOW_STEP_Y);
        assert_eq!(third.y - second.y, OVERFLOW_STEP_Y);
    }
}
