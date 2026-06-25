from __future__ import annotations
from typing import override

import async_kernel
from async_kernel.typing import Content, ExecuteContent, Job

class Kernel(async_kernel.Kernel):

    @override
    async def execute_request(self, job: Job[ExecuteContent], /) -> Content:
        msg = '"""' + job['msg']['content']['code'] + '"""'
        job['msg']['content']['code'] = f"print({msg})"
        return await super().execute_request(job)