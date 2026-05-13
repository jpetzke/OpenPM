import uuid


def test_project_create_schema_valid():
    from app.schemas.project import ProjectCreate
    p = ProjectCreate(name="Alpha", client_name="Corp")
    assert p.name == "Alpha"


def test_project_update_partial():
    from app.schemas.project import ProjectUpdate
    u = ProjectUpdate(status="completed")
    assert u.status == "completed"
    assert u.name is None


def test_add_member_schema():
    from app.schemas.project import AddMemberRequest
    uid = uuid.uuid4()
    r = AddMemberRequest(user_id=uid, role="viewer")
    assert r.role == "viewer"
