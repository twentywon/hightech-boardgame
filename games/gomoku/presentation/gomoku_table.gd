extends Node3D
## Presentation/controller for this game only. Rules live in a standalone model.
const Rules = preload("res://games/gomoku/rules/gomoku_rules.gd")
const BOARD_Y := 0.08
const STONE_Y := 0.23
var rules := Rules.new()
var camera: Camera3D
var stones: Node3D
var ghost: MeshInstance3D
var last_marker: MeshInstance3D
var status: Label
var detail: Label
var restart_button: Button
var black_material: StandardMaterial3D
var white_material: StandardMaterial3D
var gold_material: StandardMaterial3D
var animation: Tween
var input_locked := false
var stone_nodes: Dictionary = {}
var hovered := Vector2i(-1, -1)

func _ready() -> void:
	_build_world()
	_build_ui()
	rules.move_played.connect(_on_move)
	rules.game_finished.connect(_on_finished)
	_update_status()

func _material(color: Color, roughness: float = 0.5) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	return mat

func _box(size: Vector3, pos: Vector3, mat: Material, parent: Node = self) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	parent.add_child(instance)
	instance.position = pos
	return instance

func _stone(mat: Material, parent: Node) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = 0.43
	mesh.height = 0.32
	mesh.radial_segments = 40
	mesh.rings = 20
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	parent.add_child(instance)
	return instance

func _build_world() -> void:
	var env := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color("101d22")
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("d8e3eb")
	settings.ambient_light_energy = 0.65
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.environment = settings
	add_child(env)
	var light := DirectionalLight3D.new()
	add_child(light)
	light.rotation_degrees = Vector3(-55, -25, 0)
	light.light_color = Color("ffe2b6")
	light.light_energy = 1.5
	light.shadow_enabled = true
	var fill := OmniLight3D.new()
	add_child(fill)
	fill.position = Vector3(-7, 8, 4)
	fill.omni_range = 24.0
	fill.light_color = Color("bbd5ed")
	fill.light_energy = 0.8
	camera = Camera3D.new()
	add_child(camera)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.position = Vector3(0, 20, 13)
	camera.look_at(Vector3.ZERO)
	camera.current = true
	get_viewport().size_changed.connect(_resize_camera)
	_resize_camera()
	var wood := ShaderMaterial.new()
	wood.shader = preload("res://shaders/walnut.gdshader")
	gold_material = _material(Color("d7b779"), 0.3)
	gold_material.metallic = 0.65
	black_material = _material(Color("151b20"), 0.22)
	white_material = _material(Color("eee9df"), 0.26)
	_box(Vector3(200, 0.2, 200), Vector3(0, -1.0, 0), _material(Color("14272b"), 0.95))
	_box(Vector3(16.5, 0.35, 16.5), Vector3(0, -0.47, 0), _material(Color("20130d")))
	_box(Vector3(16.18, 0.06, 16.18), Vector3(0, -0.265, 0), gold_material)
	_box(Vector3(16, 0.56, 16), Vector3(0, -0.25, 0), wood)
	var ink := _material(Color("b29a72"), 0.85)
	for index in range(Rules.SIZE):
		var offset := float(index - 7)
		_box(Vector3(14.03, 0.012, 0.025), Vector3(0, 0.038, offset), ink)
		_box(Vector3(0.025, 0.012, 14.03), Vector3(offset, 0.038, 0), ink)
	for point in [Vector2i(3, 3), Vector2i(11, 3), Vector2i(7, 7), Vector2i(3, 11), Vector2i(11, 11)]:
		var dot := _stone(ink, self)
		dot.scale = Vector3(0.22, 0.04, 0.22)
		dot.position = Vector3(point.x - 7, 0.05, point.y - 7)
	stones = Node3D.new()
	stones.name = "Stones"
	add_child(stones)
	var preview_material := _material(Color(0.8, 0.7, 0.45, 0.4))
	preview_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost = _stone(preview_material, self)
	ghost.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ghost.visible = false
	last_marker = _stone(gold_material, self)
	last_marker.scale = Vector3(0.16, 0.08, 0.16)
	last_marker.visible = false

func _resize_camera() -> void:
	var size := get_viewport().get_visible_rect().size
	var aspect := size.x / maxf(size.y, 1.0)
	camera.size = maxf(21.5, 19.0 / aspect)

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	layer.add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var panel := PanelContainer.new()
	root.add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	panel.offset_left = 24
	panel.offset_right = -24
	panel.offset_top = 20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.035, 0.07, 0.085, 0.94)
	style.border_color = Color("6b5b3d")
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.content_margin_left = 22
	style.content_margin_right = 22
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	panel.add_theme_stylebox_override("panel", style)
	var column := VBoxContainer.new()
	panel.add_child(column)
	var title := Label.new()
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.text = "WORLD TABLE GAMES  /  GOMOKU"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", Color("d7b779"))
	column.add_child(title)
	status = Label.new()
	status.add_theme_font_size_override("font_size", 28)
	column.add_child(status)
	detail = Label.new()
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_theme_font_size_override("font_size", 15)
	detail.add_theme_color_override("font_color", Color("b5c5c8"))
	column.add_child(detail)
	var footer := HBoxContainer.new()
	root.add_child(footer)
	footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	footer.offset_left = 24
	footer.offset_right = -24
	footer.offset_top = -85
	footer.offset_bottom = -20
	var help := Label.new()
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.text = "LOCAL TWO PLAYER · 15 × 15\nFive or more in a row wins. No forbidden moves."
	help.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	help.add_theme_font_size_override("font_size", 14)
	footer.add_child(help)
	restart_button = Button.new()
	restart_button.text = "New game"
	restart_button.custom_minimum_size = Vector2(145, 48)
	restart_button.pressed.connect(restart)
	footer.add_child(restart_button)

func _cell_at(screen: Vector2) -> Vector2i:
	var origin := camera.project_ray_origin(screen)
	var direction := camera.project_ray_normal(screen)
	var hit: Variant = Plane(Vector3.UP, BOARD_Y).intersects_ray(origin, direction)
	if hit == null:
		return Vector2i(-1, -1)
	var point: Vector3 = hit
	if absf(point.x) > 7.45 or absf(point.z) > 7.45:
		return Vector2i(-1, -1)
	return Vector2i(roundi(point.x) + 7, roundi(point.z) + 7)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		hovered = _cell_at(event.position)
		_update_preview()
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		if not input_locked:
			rules.play(_cell_at(event.position))
		get_viewport().set_input_as_handled()

func _update_preview() -> void:
	ghost.visible = not input_locked and rules.can_play(hovered)
	if ghost.visible:
		ghost.position = Vector3(hovered.x - 7, STONE_Y, hovered.y - 7)

func _on_move(cell: Vector2i, player: int) -> void:
	input_locked = true
	ghost.visible = false
	var instance := _stone(black_material if player == Rules.BLACK else white_material, stones)
	stone_nodes[cell] = instance
	var target := Vector3(cell.x - 7, STONE_Y, cell.y - 7)
	instance.position = target + Vector3.UP * 2.5
	instance.scale = Vector3.ONE * 0.7
	last_marker.visible = false
	animation = create_tween().set_parallel(true)
	animation.tween_property(instance, "position", target, 0.32).set_trans(Tween.TRANS_BOUNCE).set_ease(Tween.EASE_OUT)
	animation.tween_property(instance, "scale", Vector3.ONE, 0.22)
	animation.chain().tween_callback(func() -> void:
		input_locked = false
		last_marker.position = target + Vector3.UP * 0.17
		last_marker.visible = true
		_update_preview()
	)
	_update_status()

func _on_finished(_winner: int) -> void:
	for cell in rules.winning_cells:
		var instance: MeshInstance3D = stone_nodes[cell]
		var mat := instance.material_override.duplicate() as StandardMaterial3D
		mat.emission_enabled = true
		mat.emission = Color("a67a30")
		mat.emission_energy_multiplier = 0.45
		instance.material_override = mat
	_update_status()

func _update_status() -> void:
	if rules.finished:
		status.text = "Draw · board complete" if rules.winner == Rules.EMPTY else ("Black wins" if rules.winner == Rules.BLACK else "White wins")
	else:
		status.text = "Black to play" if rules.current_player == Rules.BLACK else "White to play"
	detail.text = "Move %d  ·  Click or tap an empty intersection" % rules.move_count
	if rules.finished:
		detail.text = "%d stones played  ·  Start a new game to play again" % rules.move_count

func restart() -> void:
	if animation and animation.is_valid():
		animation.kill()
	for child in stones.get_children():
		stones.remove_child(child)
		child.queue_free()
	stone_nodes.clear()
	rules.reset()
	input_locked = false
	last_marker.visible = false
	_update_status()
	_update_preview()
