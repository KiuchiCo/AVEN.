import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TaskChecklistOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async move(workspaceId: string, taskId: string, itemId: string, direction: 'UP' | 'DOWN') {
    const rows = await this.prisma.taskChecklistItem.findMany({ where: { workspaceId, taskId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, position: true } });
    const index = rows.findIndex((row) => row.id === itemId);
    const neighbour = rows[index + (direction === 'UP' ? -1 : 1)];
    if (index < 0 || !neighbour) throw new NotFoundException('Checklist item cannot be moved in that direction.');
    await this.prisma.$transaction([
      this.prisma.taskChecklistItem.update({ where: { id: rows[index].id }, data: { position: -1 } }),
      this.prisma.taskChecklistItem.update({ where: { id: neighbour.id }, data: { position: rows[index].position } }),
      this.prisma.taskChecklistItem.update({ where: { id: rows[index].id }, data: { position: neighbour.position } }),
    ]);
    return { moved: itemId, direction };
  }
}
