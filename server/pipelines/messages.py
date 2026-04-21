from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


Role = Literal["user", "assistant", "behaviour"]


class Message(BaseModel):
    role: Role
    content: str
