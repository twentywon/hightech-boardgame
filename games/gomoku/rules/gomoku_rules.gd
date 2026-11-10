class_name GomokuRules
extends RefCounted
## Freestyle Gomoku. Black starts; a contiguous line of five OR MORE wins.
## No rendering, nodes, timing, input, or platform dependencies.
signal move_played(cell: Vector2i, player: int)
signal game_finished(winner: int)
const SIZE := 15
const EMPTY := 0
const BLACK := 1
const WHITE := 2
const DIRECTIONS := [Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1), Vector2i(1, -1)]
var _board: PackedInt32Array
var current_player: int = BLACK
var winner: int = EMPTY
var finished: bool = false
var move_count: int = 0
var winning_cells: Array[Vector2i] = []

func _init() -> void:
	reset()

func reset() -> void:
	_board.resize(SIZE * SIZE)
	_board.fill(EMPTY)
	current_player = BLACK
	winner = EMPTY
	finished = false
	move_count = 0
	winning_cells.clear()

func is_inside(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < SIZE and cell.y < SIZE

func stone_at(cell: Vector2i) -> int:
	return _board[cell.y * SIZE + cell.x] if is_inside(cell) else EMPTY

func can_play(cell: Vector2i) -> bool:
	return not finished and is_inside(cell) and stone_at(cell) == EMPTY

func play(cell: Vector2i) -> bool:
	if not can_play(cell):
		return false
	var player := current_player
	_board[cell.y * SIZE + cell.x] = player
	move_count += 1
	for direction: Vector2i in DIRECTIONS:
		var line: Array[Vector2i] = [cell]
		for sign_value: int in [-1, 1]:
			var next := cell + direction * sign_value
			while is_inside(next) and stone_at(next) == player:
				line.append(next)
				next += direction * sign_value
		if line.size() >= 5:
			winner = player
			winning_cells = line
			finished = true
			break
	if move_count == SIZE * SIZE:
		finished = true
	if not finished:
		current_player = WHITE if player == BLACK else BLACK
	move_played.emit(cell, player)
	if finished:
		game_finished.emit(winner)
	return true
