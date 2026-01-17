
    #[test]
    fn test_handle_remove_tag_logic() {
        // 1. Setup simulated state
        let mut state = AppState::default();
        let path1 = "/note1.md".to_string();
        let path2 = "/note2.md".to_string();
        
        let content1 = "---\ntags: [delete_me, keep_me]\n---\nBody1";
        let content2 = "---\ntags: [delete_me]\n---\nBody2";
        
        // Initial state population (simulation of storage read)
        state.notes.push(NoteMeta { 
            path: path1.clone(), 
            tags: vec!["delete_me".to_string(), "keep_me".to_string()],
            ..Default::default() 
        });
        state.notes.push(NoteMeta { 
            path: path2.clone(), 
            tags: vec!["delete_me".to_string()],
            ..Default::default() 
        });

        // 2. Execute removal
        let tag_to_remove = "delete_me";
        
        // Note 1
        let res1 = handle_remove_tag(&mut state, &path1, content1, tag_to_remove).unwrap();
        if let Effect::WriteNote { content, .. } = res1 {
            assert!(!content.contains("delete_me"));
            assert!(content.contains("keep_me"));
        }
        
        // Note 2
        let res2 = handle_remove_tag(&mut state, &path2, content2, tag_to_remove).unwrap();
        if let Effect::WriteNote { content, .. } = res2 {
            assert!(!content.contains("delete_me"));
        }

        // 3. Verify AppState update
        let updated_note1 = state.notes.iter().find(|n| n.path == path1).unwrap();
        assert_eq!(updated_note1.tags, vec!["keep_me"]); // check order or contents
        
        let updated_note2 = state.notes.iter().find(|n| n.path == path2).unwrap();
        assert!(updated_note2.tags.is_empty());
        
        // 4. Verify get_all_unique_tags
        let all_tags = get_all_unique_tags(&state);
        assert!(!all_tags.contains(&"delete_me".to_string()));
        assert!(all_tags.contains(&"keep_me".to_string()));
    }
