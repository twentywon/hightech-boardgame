extends SceneTree
const Rules = preload("res://games/gomoku/rules/gomoku_rules.gd")
var checks := 0
var failures := 0

func check(condition: bool, description: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL: " + description)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game := Rules.new()
	check(game.current_player == Rules.BLACK and game.move_count == 0, "black starts")
	check(not game.play(Vector2i(-1, 0)), "negative coordinate rejected")
	check(not game.play(Vector2i(15, 0)), "upper bound rejected")
	check(game.play(Vector2i(7, 7)), "first move accepted")
	check(game.current_player == Rules.WHITE, "turn changes")
	check(not game.play(Vector2i(7, 7)), "occupied cell rejected")
	check(game.current_player == Rules.WHITE and game.move_count == 1, "invalid move preserves state")
	check(game.stone_at(Vector2i(7, 7)) == Rules.BLACK, "stone stored")
	game.reset()
	check(game.move_count == 0 and game.stone_at(Vector2i(7, 7)) == Rules.EMPTY, "reset clears board")
	for direction: Vector2i in Rules.DIRECTIONS:
		for player in [Rules.BLACK, Rules.WHITE]:
			game = Rules.new()
			var start := Vector2i(0, 4) if direction.y < 0 else Vector2i.ZERO
			if player == Rules.WHITE:
				game.play(Vector2i(14, 14))
			for index in range(5):
				check(game.play(start + direction * index), "line move accepted")
				if index < 4:
					check(not game.finished, "four or fewer is not a win")
					game.play(Vector2i(14 - index * 2, 12))
			check(game.finished and game.winner == player, "win in direction %s for player %d" % [direction, player])
			check(game.winning_cells.size() == 5, "winning cells reported")
			check(not game.play(Vector2i(10, 10)), "moves after victory rejected")
			game.reset()
			check(not game.finished and game.winner == Rules.EMPTY and game.winning_cells.is_empty(), "reset terminal state")
	# Bridge a gap to make six: overlines are legal and win in freestyle rules.
	game = Rules.new()
	for x in [0, 1, 2, 4, 5]:
		game.play(Vector2i(x, 0))
		game.play(Vector2i(x * 2, 14))
	check(not game.finished, "gapped line does not win")
	game.play(Vector2i(3, 0))
	check(game.winner == Rules.BLACK and game.winning_cells.size() == 6, "overline wins")
	# Deterministic full-board coloring: no direction contains five equal colors.
	game = Rules.new()
	var black: Array[Vector2i] = []
	var white: Array[Vector2i] = []
	for y in range(15):
		for x in range(15):
			if (x + 2 * y) % 4 < 2:
				black.append(Vector2i(x, y))
			else:
				white.append(Vector2i(x, y))
	check(black.size() == 113 and white.size() == 112, "draw fixture turn counts")
	for index in range(112):
		check(game.play(black[index]), "draw black move")
		check(game.play(white[index]), "draw white move")
	check(not game.finished, "224 moves not terminal")
	check(game.play(black[112]), "last empty intersection accepted")
	check(game.finished and game.winner == Rules.EMPTY and game.move_count == 225, "full board draw")
	check(not game.play(Vector2i.ZERO), "draw rejects further play")
	# Real scene/controller smoke: ray picking, clicks, animation, restart mid-animation.
	var scene = load("res://scenes/gomoku.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	var screen: Vector2 = scene.camera.unproject_position(Vector3(0, scene.BOARD_Y, 0))
	check(scene._cell_at(screen) == Vector2i(7, 7), "camera ray selects center")
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = screen
	scene._unhandled_input(event)
	check(scene.rules.move_count == 1 and scene.stones.get_child_count() == 1, "click creates logical and visual stone")
	scene._unhandled_input(event)
	check(scene.rules.move_count == 1, "animation locks duplicate input")
	await create_timer(0.45).timeout
	check(not scene.input_locked and scene.last_marker.visible, "animation completes")
	var first: Node3D = scene.stones.get_child(0)
	check(is_equal_approx(first.position.y, scene.STONE_Y), "stone lands on board")
	scene.rules.play(Vector2i(8, 7))
	scene.restart_button.pressed.emit()
	await create_timer(0.45).timeout
	check(scene.rules.move_count == 0 and scene.stones.get_child_count() == 0, "restart clears model and meshes")
	check(not scene.last_marker.visible and not scene.input_locked, "restart cancels pending animation")
	scene.queue_free()
	await process_frame
	print("RESULT: %d checks, %d failures" % [checks, failures])
	quit(1 if failures else 0)
