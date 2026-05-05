from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


Role = Literal["user", "assistant", "behaviour"]


class Message(BaseModel):
    role: Role
    content: str


ROLE_LABEL: dict[str, str] = {
    "user": "User",
    "assistant": "Assistant",
    "behaviour": "Agent did",
}


def label_for(role: str) -> str:
    return ROLE_LABEL.get(role, role.capitalize())
